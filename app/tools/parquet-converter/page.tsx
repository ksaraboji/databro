"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, FileSpreadsheet, Loader2, AlertCircle, FileType, Settings } from "lucide-react";
import { motion } from "framer-motion";

import { parquetReadObjects } from "hyparquet";
import { parquetWriteBuffer } from "hyparquet-writer";
import * as XLSX from "xlsx";

type ConversionMode = "parquet_to_other" | "csv_to_parquet";
type OutputFormat = "csv" | "xlsx" | "parquet";

export default function ParquetConverterPage() {
  const [mode, setMode] = useState<ConversionMode>("parquet_to_other");
  const [file, setFile] = useState<File | null>(null);
  const [fileSize, setFileSize] = useState<string>("");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("csv");
  const [delimiter, setDelimiter] = useState<string>(",");
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleModeChange = (newMode: ConversionMode) => {
    setMode(newMode);
    setFile(null);
    setFileSize("");
    setError(null);
    setSuccessMessage(null);
    // Set default output format based on mode
    if (newMode === "parquet_to_other") {
        setOutputFormat("csv");
    } else {
        setOutputFormat("parquet");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      
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

      if (mode === "parquet_to_other") {
          // Reading Parquet
          const data = await parquetReadObjects({ file: buffer });
          
          if (!data || data.length === 0) {
              throw new Error("No data found in the Parquet file.");
          }

          // Convert to Sheet
          const worksheet = XLSX.utils.json_to_sheet(data);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");


          if (outputFormat === "csv") {
            const csvOutput = XLSX.utils.sheet_to_csv(worksheet, { FS: delimiter });
            
            // Trigger Download
            const blob = new Blob([csvOutput], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `${originalName}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          } else {
            // XLSX
            XLSX.writeFile(workbook, `${originalName}.xlsx`);
          }
          setSuccessMessage(`Successfully converted ${data.length} rows to ${outputFormat.toUpperCase()}!`);
      } else {
          // CSV to Parquet
          let data: any[] = [];
          
          // Use XLSX to parse CSV (robust enough)
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Convert to JSON
          data = XLSX.utils.sheet_to_json(worksheet);
          
          if (!data || data.length === 0) {
             throw new Error("No data found in the CSV file.");
          }
          
          await writeParquetFile(data, originalName);
          setSuccessMessage(`Successfully converted ${data.length} rows to Parquet!`);
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to convert file.");
    } finally {
      setIsConverting(false);
    }
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
              Parquet Converter
            </h1>
            <p className="text-lg text-slate-600">
              Convert between Parquet and CSV/Excel formats entirely in your browser.
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
                
                {/* Mode Switcher */}
                <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                        onClick={() => handleModeChange("parquet_to_other")}
                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${mode === "parquet_to_other" ? "bg-white text-slate-900 shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:text-slate-700"}`}
                    >
                        Parquet → CSV/Excel
                    </button>
                    <button
                        onClick={() => handleModeChange("csv_to_parquet")}
                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${mode === "csv_to_parquet" ? "bg-white text-slate-900 shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:text-slate-700"}`}
                    >
                        CSV → Parquet
                    </button>
                </div>

                {/* 1. File Upload */}
                <div className="space-y-4">
                    <label className="block text-sm font-bold text-slate-900 uppercase tracking-wide">
                        1. Upload {mode === "parquet_to_other" ? "Parquet" : "CSV"} File
                    </label>
                    <div className="relative group">
                         <input 
                            type="file" 
                            accept={mode === "parquet_to_other" ? ".parquet" : ".csv"}
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
                                        {mode === "parquet_to_other" ? ".parquet files supported" : ".csv files supported"}
                                    </span>
                                </div>
                            )}
                         </div>
                    </div>
                </div>

                {/* 2. Options */}
                {file && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="space-y-6 pt-4 border-t border-slate-100"
                    >
                         <div className="grid sm:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <label className="block text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                                    <FileType className="w-4 h-4" /> Output Format
                                </label>
                                {mode === "parquet_to_other" ? (
                                    <div className="flex gap-3">
                                        <button 
                                            onClick={() => setOutputFormat("csv")}
                                            className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold border transition-all ${outputFormat === 'csv' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                                        >
                                            CSV (.csv)
                                        </button>
                                        <button 
                                            onClick={() => setOutputFormat("xlsx")}
                                            className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold border transition-all ${outputFormat === 'xlsx' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                                        >
                                            Excel (.xlsx)
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex gap-3">
                                        <div className="flex-1 py-2 px-4 rounded-lg text-sm font-semibold border bg-slate-100 text-slate-500 border-slate-200 flex items-center justify-center gap-2 cursor-not-allowed">
                                            <span>Parquet (.parquet)</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Delimiter only for CSV output */}
                            {outputFormat === 'csv' && mode === "parquet_to_other" && (
                                <div className="space-y-3">
                                    <label className="block text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                                        <Settings className="w-4 h-4" /> Delimiter
                                    </label>
                                    <input 
                                        type="text" 
                                        value={delimiter}
                                        onChange={(e) => setDelimiter(e.target.value)}
                                        className="w-full h-[42px] px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono text-center text-lg"
                                        placeholder=","
                                        maxLength={1}
                                    />
                                    <p className="text-xs text-slate-400 text-center">Default is comma (,)</p>
                                </div>
                            )}
                         </div>

                        {/* 3. Action */}
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
                                        Convert & Download
                                        {mode === "parquet_to_other" 
                                            ? (outputFormat === 'csv' ? '.csv' : '.xlsx')
                                            : '.parquet'
                                        }
                                    </>
                                )}
                            </button>
                         </div>
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
            Powered by <a href="https://github.com/hyparam/hyparquet" target="_blank" className="underline hover:text-slate-600">hyparquet</a>, hyparquet-writer and <a href="https://sheetjs.com/" target="_blank" className="underline hover:text-slate-600">SheetJS</a>. 
            <br className="hidden sm:block"/> No data leaves your browser.
        </p>

      </div>
    </div>
  );
}
