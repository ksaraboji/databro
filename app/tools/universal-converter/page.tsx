"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, FileSpreadsheet, Loader2, AlertCircle, FileType, Settings } from "lucide-react";
import { motion } from "framer-motion";

import { parquetReadObjects } from "hyparquet";
import { parquetWriteBuffer } from "hyparquet-writer";
import * as XLSX from "xlsx";
import { DuckDBClient } from "@/lib/duckdb";
import { tableToIPC, tableFromIPC, Table, vectorFromArray } from "apache-arrow";
import avro from 'avsc';

type ConversionMode = "universal" | "view_query";
type Format = "csv" | "xlsx" | "parquet" | "arrow" | "avro";

export default function GenericConverterPage() {
  const [mode, setMode] = useState<ConversionMode>("universal");
  const [file, setFile] = useState<File | null>(null);
  const [fileSize, setFileSize] = useState<string>("");
  const [inputFormat, setInputFormat] = useState<Format>("csv");  // Detected or selected
  const [outputFormat, setOutputFormat] = useState<Format>("parquet");

  const [delimiter, setDelimiter] = useState<string>(",");
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("SELECT * FROM 'data.parquet' LIMIT 10;");
  const [queryResult, setQueryResult] = useState<any[] | null>(null);
  const [queryColumns, setQueryColumns] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleModeChange = (newMode: ConversionMode) => {
    setMode(newMode);
    setFile(null);
    setFileSize("");
    setError(null);
    setSuccessMessage(null);
    setQueryResult(null);
    setQueryColumns([]);
    setQuery("SELECT * FROM 'data.parquet' LIMIT 10;");
  };
 
  const detectFormat = (filename: string): Format => {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext === 'parquet') return 'parquet';
      if (ext === 'csv') return 'csv';
      if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
      if (ext === 'arrow' || ext === 'ipc') return 'arrow';
      if (ext === 'avro') return 'avro';
      return 'csv'; // Default
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setInputFormat(detectFormat(selected.name));
      
      let sizeStr = "";
      if (selected.size < 1024) {
          sizeStr = selected.size + " Bytes";
      } else if (selected.size < 1024 * 1024) {
          sizeStr = (selected.size / 1024).toFixed(2) + " KB";
      } else {
          sizeStr = (selected.size / (1024 * 1024)).toFixed(2) + " MB";
      }
      
      setFileSize(sizeStr);
      setError(null);
      setSuccessMessage(null);
      setQuery(`SELECT * FROM '${selected.name}' LIMIT 10;`);
    }
  };

  const handleQuery = async () => {
      if (!file) return;
      setIsExecuting(true);
      setError(null);
      
      try {
          const conn = await DuckDBClient.getConnection();
          if (!conn) throw new Error("Could not connect to DuckDB");

          const buffer = await file.arrayBuffer();
          const fileName = file.name;
          
          // Use a copy for registration to prevent buffer detachment issues if used locally later
          await DuckDBClient.registerFile(fileName, new Uint8Array(buffer.slice(0)));
          
          if (inputFormat === 'parquet') {
             // Already registered, query directly
          } else if (inputFormat === 'csv') {
             // DuckDB handles CSV auto-detection automatically with read_csv_auto or just table name
          } else if (inputFormat === 'xlsx') {
             // Convert XLSX to CSV/JSON first? 
             // DuckDB in browser doesn't support spatial/excel extensions easily.
             // We reuse our parsing logic:
             const workbook = XLSX.read(buffer, { type: 'array' });
             const firstSheetName = workbook.SheetNames[0];
             const worksheet = workbook.Sheets[firstSheetName];
             const jsonData = XLSX.utils.sheet_to_json(worksheet);
             
             // Register as JSON file
             const jsonContent = JSON.stringify(jsonData);
             const jsonFileName = fileName.replace(/\.[^/.]+$/, "") + ".json";
             await DuckDBClient.registerFile(jsonFileName, new TextEncoder().encode(jsonContent));
             
             // Update query to select from this json file
             if (query.includes('data.parquet') || query.includes(fileName)) {
                  setQuery(`SELECT * FROM read_json_auto('${jsonFileName}') LIMIT 10;`);
                  // Execute immediately with new query
                  const result = await conn.query(`SELECT * FROM read_json_auto('${jsonFileName}') LIMIT 10;`);
                  const rows = result.toArray().map((row: any) => row.toJSON());
                  if (rows.length > 0) setQueryColumns(Object.keys(rows[0]));
                  setQueryResult(rows);
                  return; // Exit as we handled it
             }
          } else if (inputFormat === 'arrow') {
             const table = tableFromIPC(new Uint8Array(buffer));
             const jsonData = table.toArray().map(row => row.toJSON());
             
             const jsonFileName = fileName.replace(/\.[^/.]+$/, "") + ".json";
             const jsonContent = JSON.stringify(jsonData);
             await DuckDBClient.registerFile(jsonFileName, new TextEncoder().encode(jsonContent));
             
             if (query.includes('data.parquet') || query.includes(fileName)) {
                  setQuery(`SELECT * FROM read_json_auto('${jsonFileName}') LIMIT 10;`);
                  const result = await conn.query(`SELECT * FROM read_json_auto('${jsonFileName}') LIMIT 10;`);
                  const rows = result.toArray().map((row: any) => row.toJSON());
                  if (rows.length > 0) setQueryColumns(Object.keys(rows[0]));
                  setQueryResult(rows);
                  return;
             }
          } else if (inputFormat === 'avro') {
             // Decode Avro to JSON
             const jsonData: any[] = [];
             await new Promise<void>((resolve, reject) => {
                const decoder = new avro.streams.BlockDecoder();
                decoder.on('data', (record: any) => { jsonData.push(record); });
                decoder.on('end', () => resolve());
                decoder.on('error', (err: any) => reject(err));
                decoder.write(Buffer.from(buffer));
                decoder.end();
             });

             const jsonFileName = fileName.replace(/\.[^/.]+$/, "") + ".json";
             const jsonContent = JSON.stringify(jsonData);
             await DuckDBClient.registerFile(jsonFileName, new TextEncoder().encode(jsonContent));

             if (query.includes('data.parquet') || query.includes(fileName)) {
                  setQuery(`SELECT * FROM read_json_auto('${jsonFileName}') LIMIT 10;`);
                  const result = await conn.query(`SELECT * FROM read_json_auto('${jsonFileName}') LIMIT 10;`);
                  const rows = result.toArray().map((row: any) => row.toJSON());
                  if (rows.length > 0) setQueryColumns(Object.keys(rows[0]));
                  setQueryResult(rows);
                  return;
             }
          }

          // Default path for Parquet/CSV/Arrow (direct support)
          // If query was valid for them
          
          // Auto-adjust query if it is currently default
          let finalQuery = query;
          if (query === "SELECT * FROM 'data.parquet' LIMIT 10;") {
               // Update it to use the new filename
               if (inputFormat === 'csv') {
                   finalQuery = `SELECT * FROM read_csv_auto('${fileName}') LIMIT 10;`;
               } else {
                   finalQuery = `SELECT * FROM '${fileName}' LIMIT 10;`;
               }
               setQuery(finalQuery);
          }

          const result = await conn.query(finalQuery);
          const rows = result.toArray().map((row: any) => row.toJSON());
          
          if (rows.length > 0) {
              setQueryColumns(Object.keys(rows[0]));
          }
          setQueryResult(rows);
          
      } catch (err: any) {
          console.error(err);
          setError(err.message || "Query execution failed");
      } finally {
          setIsExecuting(false);
      }
  };

  const writeParquetFile = async (data: any[], fileName: string) => {
       // Infer schema
       // Data is array of objects. hyparquet-writer expects array of ColumnSourc (basically arrays of values per column)
       // We need to re-orient row-based JSON to column-based arrays 
       if (data.length === 0) throw new Error("No data to write");
       
       const keys = Object.keys(data[0]);
       const columnData = keys.map(key => ({
            name: key,
            data: data.map(row => row[key]) // keys.map generates the columns, data maps the rows
       }));

       // Write to buffer
       // hyparquet-writer infers schema if not provided
       const buffer = parquetWriteBuffer({
           columnData,
       });
       
       // Download
        const blob = new Blob([buffer], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `${fileName}.parquet`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
  };

  const convertAndDownload = async () => {
    if (!file) return;

    setIsConverting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const buffer = await file.arrayBuffer();
      const originalName = file.name.replace(/\.[^/.]+$/, "");
      let data: any[] = [];
      
      // ===== READ INPUT =====
      if (inputFormat === 'parquet') {
           data = await parquetReadObjects({ file: buffer });
      } else if (inputFormat === 'csv' || inputFormat === 'xlsx') {
           const workbook = XLSX.read(buffer, { type: 'array' });
           const firstSheetName = workbook.SheetNames[0];
           const worksheet = workbook.Sheets[firstSheetName];
           data = XLSX.utils.sheet_to_json(worksheet);
      } else if (inputFormat === 'arrow') {
           const table = tableFromIPC(new Uint8Array(buffer));
           data = table.toArray().map(row => row.toJSON());
      } else if (inputFormat === 'avro') {
           // Basic Avro reading - need to know schema or infer?
           // avsc.FileDecoder?
           // avsc usually works with buffers.
           data = [];
           await new Promise<void>((resolve, reject) => {
                const decoder = new avro.streams.BlockDecoder();
                decoder.on('data', (record: any) => { data.push(record); });
                decoder.on('end', () => resolve());
                decoder.on('error', (err: any) => reject(err));
                decoder.write(Buffer.from(buffer));
                decoder.end();
           });
      }

      if (!data || data.length === 0) {
          throw new Error(`No data found in the ${inputFormat} file.`);
      }

      // ===== WRITE OUTPUT =====
      if (outputFormat === 'parquet') {
           await writeParquetFile(data, originalName);
           setSuccessMessage(`Converted ${data.length} rows to .parquet`);
      } else if (outputFormat === 'csv') {
           const worksheet = XLSX.utils.json_to_sheet(data);
           const csvOutput = XLSX.utils.sheet_to_csv(worksheet, { FS: delimiter });
           downloadFile(csvOutput, originalName, 'csv', 'text/csv;charset=utf-8;');
           setSuccessMessage(`Converted ${data.length} rows to .csv`);
      } else if (outputFormat === 'xlsx') {
           const worksheet = XLSX.utils.json_to_sheet(data);
           const workbook = XLSX.utils.book_new();
           XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
           XLSX.writeFile(workbook, `${originalName}.xlsx`);
           setSuccessMessage(`Converted ${data.length} rows to .xlsx`);
      } else if (outputFormat === 'arrow') {
           // JSON -> Arrow
           // We need to infer schema or just pack?
           // Apache Arrow 'tableFromJSON' isn't direct. We use map.
           // Simplified: Create columns from keys
           if (data.length > 0) {
              // Very basic inference: 
              // Convert array of objects to Arrow Table
              // This is complex for nested data, but for flat CSV it works.
              // We'll use a hack: DuckDB is actually better for this if we had it loaded.
              // But pure JS:
              const keys = Object.keys(data[0]);
              const columns: {[key: string]: any[]} = {};
              keys.forEach(k => columns[k] = []);
              data.forEach(row => {
                  keys.forEach(k => columns[k].push(row[k]));
              });
              
              // We construct vectors? 
              // Usually: const table = new Table({ col1: vector1, col2: vector2 })
              // Arrow JS is verbose. 
              // Fallback to minimal effort: 
              //   const table = tableFromJSON(data); // if supported? No
              // Let's use simplified approach or error out for complex types
              
              // Actually, simpler way:
              //   const table = Table.from([ {a:1}, {a:2} ]); // Recent arrow
               const table = new Table(
                    Object.fromEntries(
                        keys.map(k => [k, vectorFromArray(columns[k])])
                    )
               );

               const outputBuffer = tableToIPC(table, 'file');
               downloadBlob(new Blob([outputBuffer as any]), originalName, 'arrow');
               setSuccessMessage(`Converted ${data.length} rows to .arrow`);
           }
      } else if (outputFormat === 'avro') {
           // JSON -> Avro
           // Need schema. Infer from data[0]?
           const type = avro.Type.forValue(data[0]); 
           // BUT forValue(data[0]) infers schema for one record.
           // We need a schema that wraps these records?
           // No, usually we write an Object Container File (OCF).
           
           // We can't write OCF easily with basic avsc in browser without streams?
           // type.toBuffer(val) writes a single record.
           // avsc.createFileEncoder(stream, type);
           
           // Simpler: Just write single record buffer? No, user wants a file.
           // Let's try to make a basic OCF in memory.
           // Browser support for avsc streams is tricky.
           // Fallback: Use DuckDB if available? DuckDB Wasm writes Parquet/Arrow/CSV/JSON. Not Avro.
           
           // Let's defer Avro writing or warn it is experimental/single-record based?
           // Or just infer schema and use the block encoder manually.
           // const encoder = avro.createFileEncoder(undefined, { schema: type }); // undefined path = stream?
           // In browser, this relies on node streams.
           throw new Error("Writing Avro is not fully supported in browser mode yet.");
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to convert file.");
    } finally {
      setIsConverting(false);
    }
  };

  const downloadFile = (content: string, fileName: string, ext: string, mime: string) => {
      downloadBlob(new Blob([content], { type: mime }), fileName, ext);
  };

  const downloadBlob = (blob: Blob, fileName: string, ext: string) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${fileName}.${ext}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };


  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-8 py-12">
        {/* Header */}
        <header className="space-y-4 text-center sm:text-left">
          <Link
            href="/tools"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Tools
          </Link>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 flex items-center justify-center sm:justify-start gap-3">
              <FileSpreadsheet className="w-10 h-10 text-orange-600" />
              Universal Converter & SQL Viewer
            </h1>
            <p className="text-lg text-slate-600">
              Convert between Parquet, CSV, Excel, Arrow, and Avro formats, or query files directly with SQL entirely in your browser.
            </p>
          </motion.div>
        </header>

        {/* Main Card */}
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
        >
            <div className="p-6 sm:p-8 space-y-8">
                
                        {/* Mode Switcher Buttons */}
                        <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                             <button onClick={() => handleModeChange('universal')} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${mode === 'universal' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Converter</button>
                             <button onClick={() => handleModeChange('view_query')} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${mode === 'view_query' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>SQL Viewer</button>
                        </div>

                        {/* Input Format Display */}
                        {file && mode === 'universal' && (
                            <div className="flex items-center gap-2 mb-4 text-sm text-slate-600 bg-blue-50 p-2 rounded-lg border border-blue-100">
                                <span className="font-bold">Detected Input Format:</span>
                                <span className="uppercase bg-white px-2 py-0.5 rounded border border-blue-200 text-xs font-mono">{inputFormat}</span>
                            </div>
                        )}
                        
                        {/* Output Format Selector */}
                        {file && mode === 'universal' && (
                             <div className="space-y-3 mb-6">
                                <label className="block text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                                    <FileType className="w-4 h-4" /> Output Format
                                </label>
                                <div className="flex flex-wrap gap-3">
                                    {(['parquet', 'csv', 'xlsx', 'arrow'] as Format[]).map(fmt => (
                                        <button 
                                            key={fmt}
                                            onClick={() => setOutputFormat(fmt)}
                                            className={`flex-1 min-w-[100px] py-2 px-4 rounded-lg text-sm font-semibold border transition-all ${outputFormat === fmt ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                                        >
                                            {fmt === 'xlsx' ? 'Excel' : fmt.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                             </div>
                        )}

                        {/* 1. File Upload */}
                <div className="space-y-4">
                    <label className="block text-sm font-bold text-slate-900 uppercase tracking-wide">
                        1. Upload Source File
                    </label>
                    <div className="relative group">
                         <input 
                            type="file" 
                            accept=".parquet,.csv,.xlsx,.xls,.arrow,.ipc,.avro"
                            onChange={handleFileChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            key={mode} // Reset input when mode changes
                         />
                         <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${ file ? 'border-orange-300 bg-orange-50/50' : 'border-slate-300 hover:border-orange-400 hover:bg-slate-50' }`}>
                            {file ? (
                                <div className="flex flex-col items-center gap-2 text-slate-700">
                                    <FileSpreadsheet className="w-10 h-10 text-orange-500" />
                                    <span className="font-semibold text-lg">{file.name}</span>
                                    <span className="text-sm text-slate-500">{fileSize}</span>
                                    <button className="text-xs text-orange-600 font-medium underline mt-2">Change File</button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-3 text-slate-500">
                                    <Upload className="w-8 h-8 opacity-50" />
                                    <div>
                                        <span className="font-medium text-slate-700">Click to upload</span> or drag and drop
                                    </div>
                                    <span className="text-xs opacity-70">
                                        {mode === 'universal'
                                          ? "Supports Parquet, CSV, Excel, Arrow, Avro"
                                          : "Supports Parquet, CSV, Excel, Arrow, Avro"}
                                    </span>
                                </div>
                            )}
                         </div>
                    </div>
                </div>

                {/* 2. Options / Query Editor */}
                {file && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="space-y-6 pt-4 border-t border-slate-100"
                    >
                         {mode === "view_query" ? (
                             <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="block text-sm font-bold text-slate-900 uppercase tracking-wide">
                                        SQL Query (File is named '{file.name}')
                                    </label>
                                    <div className="relative">
                                    <textarea 
                                        value={query} 
                                        onChange={(e) => setQuery(e.target.value)}
                                        className="w-full h-32 px-4 py-3 rounded-lg border border-slate-200 font-mono text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-y"
                                    />
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            onClick={handleQuery}
                                            disabled={isExecuting}
                                            className="px-6 py-2 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                            Run Query
                                        </button>
                                    </div>
                                </div>
                                
                                {queryResult && (
                                    <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[500px]">
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-xs text-slate-700 uppercase bg-slate-50 sticky top-0">
                                                <tr>
                                                    {queryColumns.map(col => (
                                                        <th key={col} className="px-6 py-3 whitespace-nowrap border-b border-slate-200">
                                                            {col}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {queryResult.map((row, i) => (
                                                    <tr key={i} className="bg-white border-b hover:bg-slate-50">
                                                        {queryColumns.map(col => (
                                                            <td key={`${i}-${col}`} className="px-6 py-4 whitespace-nowrap text-slate-600">
                                                                {row[col]?.toString() || ''}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <div className="bg-slate-50 px-4 py-2 text-xs text-slate-500 border-t border-slate-200">
                                            Showing {queryResult.length} rows
                                        </div>
                                    </div>
                                )}
                             </div>
                         ) : (
                             // Conversion Options
                                (outputFormat === 'csv') && (
                                    <div className="space-y-3 mb-6">
                                        <label className="block text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                                            <Settings className="w-4 h-4" /> Delimiter
                                        </label>
                                        <input 
                                            type="text" 
                                            value={delimiter}
                                            onChange={(e) => setDelimiter(e.target.value)}
                                            className="w-full h-[42px] px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono text-center text-lg max-w-[100px]"
                                            placeholder=","
                                            maxLength={1}
                                        />
                                        <p className="text-xs text-slate-400">Default is comma (,)</p>
                                    </div>
                                )
                         )}

                        {/* 3. Action (Only for conversion modes) */}
                         {mode !== "view_query" && (
                            <div className="pt-4">
                                <button
                                    onClick={convertAndDownload}
                                    disabled={isConverting}
                                    className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                                        isConverting 
                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : 'bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-200 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]'
                                    }`}
                                >
                                    {isConverting ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" /> Converting...
                                        </>
                                    ) : (
                                        <>
                                            Convert & Download {outputFormat.toUpperCase()}
                                        </>
                                    )}
                                </button>
                            </div>
                         )}
                    </motion.div>
                )}

                {/* Feedback Messages */}
                {error && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-red-50 text-red-600 rounded-lg flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                            <span className="font-bold block">Conversion Failed</span>
                            <span className="text-sm opacity-90">{error}</span>
                        </div>
                    </motion.div>
                )}

                {successMessage && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-green-50 text-green-700 rounded-lg flex items-center gap-3">
                        <div className="w-6 h-6 bg-green-200 rounded-full flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <span className="font-medium">{successMessage}</span>
                    </motion.div>
                )}
            </div>
        </motion.div>

        {/* Info Footer */}
        <p className="text-center text-slate-400 text-sm">
            Powered by <a href="https://github.com/hyparam/hyparquet" target="_blank" className="underline hover:text-slate-600">hyparquet</a>, hyparquet-writer, <a href="https://sheetjs.com/" target="_blank" className="underline hover:text-slate-600">SheetJS</a>, Apache Arrow, and avsc.
            <br className="hidden sm:block"/> No data leaves your browser.
        </p>

      </div>
    </div>
  );
}
