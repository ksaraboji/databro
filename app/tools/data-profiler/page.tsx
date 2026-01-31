"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, FileSpreadsheet, Activity, ChevronRight, BarChart3, PieChart, Table as TableIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { DuckDBClient } from "@/lib/duckdb";
import { tableFromIPC } from "apache-arrow";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";

type LoadState = "idle" | "loading" | "analyzing" | "complete" | "error";

interface ColumnStats {
  column_name: string;
  column_type: string;
  min: string | null;
  max: string | null;
  approx_unique: number;
  null_percentage: number;
  count: number;
}

interface TopValue {
  value: string;
  count: number;
}

interface ColumnDetail {
  stats: ColumnStats;
  topValues: TopValue[];
  distribution?: { bin: string; count: number }[]; // For numeric histograms later
}

export default function DataProfilerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ColumnStats[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [columnDetails, setColumnDetails] = useState<Record<string, ColumnDetail>>({});
  const [activeTab, setActiveTab] = useState<"summary" | "explore">("summary");

  const colors = ["#4f46e5", "#ec4899", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981"];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setLoadState("idle");
      setSummary([]);
      setColumnDetails({});
      setSelectedColumn(null);
      setError(null);
    }
  };

  const analyzeFile = async () => {
    console.log("Analyze file started");
    if (!file) {
      console.log("No file selected");
      return;
    }
    setLoadState("loading");
    setError(null);

    try {
      console.log("Connecting to DuckDB...");
      const conn = await DuckDBClient.getConnection();
      if (!conn) throw new Error("Could not connect to DuckDB");
      console.log("Connected to DuckDB");

      const buffer = await file.arrayBuffer();
      console.log("File buffer read, size:", buffer.byteLength);

      // Use a hardcoded safe filename to avoid "illegal path" errors in DuckDB-Wasm
      // Ensure specific safe extension
      let fileExt = file.name.split('.').pop()?.toLowerCase() || 'dat';
      if (!/^[a-z0-9]+$/.test(fileExt)) fileExt = 'dat';
      
      const fileName = `input_data.${fileExt}`;
      const ext = fileExt;
      let tableName = 'analyzed_data'; // We'll create a view or use the file directly
      
      console.log("Registering file as:", fileName);

      // Register File
      if (ext === 'parquet') {
         await DuckDBClient.registerFile(fileName, new Uint8Array(buffer));
         // Create a view for easier referencing
         await conn.query(`CREATE OR REPLACE VIEW ${tableName} AS SELECT * FROM '${fileName}'`);
      } else if (ext === 'csv') {
         await DuckDBClient.registerFile(fileName, new Uint8Array(buffer));
         // read_csv_auto is robust
         await conn.query(`CREATE OR REPLACE VIEW ${tableName} AS SELECT * FROM read_csv_auto('${fileName}')`);
      } else if (ext === 'json') {
          await DuckDBClient.registerFile(fileName, new Uint8Array(buffer));
          await conn.query(`CREATE OR REPLACE VIEW ${tableName} AS SELECT * FROM read_json_auto('${fileName}')`);
      } else if (['xlsx', 'xls'].includes(ext || '')) {
          setLoadState("loading"); // Excel parsing is heavy
          console.log("Parsing Excel...");
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          const jsonContent = JSON.stringify(jsonData);
          // Safe JSON filename
          const jsonFileName = `input_data.json`;
          
          await DuckDBClient.registerFile(jsonFileName, new TextEncoder().encode(jsonContent));
          await conn.query(`CREATE OR REPLACE VIEW ${tableName} AS SELECT * FROM read_json_auto('${jsonFileName}')`);
      } else if (['arrow', 'ipc'].includes(ext || '')) {
          const table = tableFromIPC(new Uint8Array(buffer));
          const jsonData = table.toArray().map(row => row.toJSON());
          const jsonContent = JSON.stringify(jsonData);
          // Safe JSON filename
          const jsonFileName = `input_data.json`;
          await DuckDBClient.registerFile(jsonFileName, new TextEncoder().encode(jsonContent));
          await conn.query(`CREATE OR REPLACE VIEW ${tableName} AS SELECT * FROM read_json_auto('${jsonFileName}')`);
      } else {
        throw new Error(`Unsupported file extension: .${ext}`);
      }

      console.log("File registered. Summarizing...");
      setLoadState("analyzing");

      // 1. Run SUMMARIZE
      const result = await conn.query(`SUMMARIZE ${tableName}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = result.toArray().map((row: any) => {
        const r = row.toJSON();
        // Convert BigInts to number/string for display
        return {
            column_name: r.column_name,
            column_type: r.column_type,
            min: r.min,
            max: r.max,
            approx_unique: Number(r.approx_unique),
            null_percentage: Number(r.null_percentage),
            count: Number(r.count)
        };
      });

      console.log("Summarized rows:", rows.length);
      setSummary(rows);
      setLoadState("complete");

      // Select first column by default
      if (rows.length > 0) {
        setSelectedColumn(rows[0].column_name);
        // Pass rows to avoid closure staleness
        fetchColumnDetails(rows[0].column_name, tableName, rows);
      }

    } catch (err) {
      console.error("Analysis failed:", err);
      setError(err instanceof Error ? err.message : "Failed to analyze file");
      setLoadState("error");
    }
  };

  const fetchColumnDetails = async (colName: string, tableName = 'analyzed_data', currentSummary?: ColumnStats[]) => {
      // Use provided summary if available (for initial load) or fallback to state
      // IMPORTANT: State 'summary' might be stale if this is called immediately after setSummary
      const sourceSummary = currentSummary || summary;

      // Check cache
      if (columnDetails[colName]) {
          setSelectedColumn(colName);
          return;
      }
      
      try {
        const conn = await DuckDBClient.getConnection();
        if (!conn) return;

        // Get Top 10 Values
        // Cast to string to handle all types uniformly for grouping
        const topQuery = `
            SELECT CAST("${colName}" AS VARCHAR) as value, COUNT(*) as count 
            FROM ${tableName} 
            WHERE "${colName}" IS NOT NULL 
            GROUP BY value 
            ORDER BY count DESC 
            LIMIT 10
        `;
        const topResult = await conn.query(topQuery);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const topValues = topResult.toArray().map((row: any) => ({
            value: row.toJSON().value,
            count: Number(row.toJSON().count)
        }));

        const colStats = sourceSummary.find(s => s.column_name === colName);
        if (!colStats) {
            console.error("Could not find stats for column", colName);
            return;
        }

        setColumnDetails(prev => ({
            ...prev,
            [colName]: {
                stats: colStats,
                topValues
            }
        }));
        setSelectedColumn(colName);


      } catch (err) {
          console.error("Failed to fetch column details", err);
      }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex items-center justify-between pb-6 border-b border-slate-200">
           <div className="flex items-center gap-4">
             <Link 
                href="/tools"
                className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-900"
             >
                <ArrowLeft className="w-5 h-5" />
             </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Data Profiler & Explorer</h1>
                <p className="text-slate-500 text-sm hidden sm:block">Analyze distributions, missing values, and stats instantly</p>
              </div>
            </div>
          </div>
          <Link 
            href="/"
            className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
          >
            Home
          </Link>
        </header>

        {/* Upload Section */}
        {!file ? (
             <div className="max-w-2xl mx-auto mt-12">
                <div className="relative group cursor-pointer">
                    <input 
                        type="file" 
                        onChange={handleFileChange}
                        accept=".csv,.parquet,.json,.xlsx,.arrow"
                        className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                    />
                    <div className="border-3 border-dashed border-slate-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center hover:border-indigo-400 hover:bg-white transition-all bg-slate-50/50">
                        <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                            <Upload className="w-8 h-8 text-indigo-600" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Upload Data File</h3>
                        <p className="text-slate-500 mb-4">Support for CSV, Parquet, JSON, Excel, Arrow</p>
                        <button className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-sm group-hover:bg-indigo-700 transition-colors">
                            Select File
                        </button>
                    </div>
                </div>
             </div>
        ) : (
            <div className="flex flex-col h-full gap-6">
                
                {/* File Info Bar - Redesigned to avoid overlap with fixed elements */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        {/* Left: File Details */}
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                                <FileSpreadsheet className="w-8 h-8" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-lg font-bold text-slate-900 truncate" title={file.name}>
                                    {file.name}
                                </h3>
                                <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                                    <span className="font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                                    {loadState === 'complete' && (
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-bold uppercase tracking-wide">
                                            Ready
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right: Actions - Wrapped in safe container with right padding to clear Post-It */}
                        <div className="w-full md:w-auto flex flex-col sm:flex-row items-center justify-end gap-3 md:pl-8 xl:pr-48 transition-all">
                             {loadState === 'error' ? (
                                <div className="flex items-center gap-3 text-red-600 bg-red-50 px-4 py-2 rounded-lg text-sm font-medium w-full md:w-auto justify-center">
                                    <Activity className="w-4 h-4" />
                                    <span>Error: {error}</span>
                                    <button onClick={() => setFile(null)} className="underline hover:text-red-800">Retry</button>
                                </div>
                            ) : loadState !== 'complete' && loadState !== 'idle' ? (
                                <div className="flex items-center gap-3 text-indigo-600 bg-indigo-50 px-5 py-2.5 rounded-lg font-medium animate-pulse w-full md:w-auto justify-center">
                                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                    <span>{loadState === 'loading' ? 'Loading File...' : 'Analyzing Data...'}</span>
                                </div>
                            ) : (
                                <>
                                    <button 
                                        onClick={() => setFile(null)} 
                                        className="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors w-full sm:w-auto border border-transparent hover:border-slate-200"
                                    >
                                        Analyze Another
                                    </button>
                                    
                                    {loadState === 'idle' && (
                                        <button 
                                            onClick={() => analyzeFile()}
                                            className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-lg shadow-md shadow-indigo-200 hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all w-full sm:w-auto flex items-center justify-center gap-2"
                                        >
                                            <Activity className="w-4 h-4" />
                                            Analyze Now
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                {loadState === 'complete' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Left: Column List / Stats Table */}
                        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col max-h-[800px]">
                            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <TableIcon className="w-4 h-4 text-slate-500" />
                                    Column Statistics
                                </h3>
                                <div className="text-xs text-slate-500 font-mono">
                                    {summary.length} Columns
                                </div>
                            </div>
                            <div className="overflow-auto flex-grow">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="px-4 py-3 font-semibold">Column</th>
                                            <th className="px-4 py-3 font-semibold">Type</th>
                                            <th className="px-4 py-3 font-semibold">Missing %</th>
                                            <th className="px-4 py-3 font-semibold text-right">Unique</th>
                                            <th className="px-4 py-3 font-semibold text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {summary.map((col) => (
                                            <tr 
                                                key={col.column_name} 
                                                onClick={() => fetchColumnDetails(col.column_name)}
                                                className={cn(
                                                    "cursor-pointer transition-colors hover:bg-indigo-50/50 group",
                                                    selectedColumn === col.column_name ? "bg-indigo-50 hover:bg-indigo-50" : "bg-white"
                                                )}
                                            >
                                                <td className="px-4 py-3 font-medium text-slate-900">
                                                    {col.column_name}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-mono border border-slate-200">
                                                        {col.column_type}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div 
                                                                className={cn("h-full rounded-full", col.null_percentage > 0 ? "bg-red-400" : "bg-green-400")}
                                                                style={{ width: `${Math.min(col.null_percentage || 0, 100)}%` }}
                                                            ></div>
                                                        </div>
                                                        {col.null_percentage ? (Number(col.null_percentage)).toFixed(1) + "%" : "0%"}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-slate-600">
                                                    {col.approx_unique.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                     <ChevronRight className={cn(
                                                         "w-4 h-4 text-slate-300 ml-auto transition-transform",
                                                         selectedColumn === col.column_name ? "text-indigo-600 rotate-90" : "group-hover:text-indigo-400"
                                                     )} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Right: Detail View / Charts */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full min-h-[500px]">
                            {selectedColumn && columnDetails[selectedColumn] ? (
                                <div className="flex flex-col h-full">
                                    <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                                        <h3 className="font-bold text-lg text-slate-900">{selectedColumn}</h3>
                                        <p className="text-xs text-slate-500 font-mono mt-1">
                                            {columnDetails[selectedColumn].stats.column_type}
                                        </p>
                                    </div>
                                    
                                    <div className="p-6 space-y-8 flex-grow overflow-y-auto">
                                        {/* Key Metrics Grid */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                <span className="text-xs text-slate-500 uppercase font-semibold">Min Value</span>
                                                <p className="text-sm font-mono font-medium text-slate-900 truncate" title={columnDetails[selectedColumn].stats.min || '-'}>
                                                    {columnDetails[selectedColumn].stats.min || '-'}
                                                </p>
                                            </div>
                                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                <span className="text-xs text-slate-500 uppercase font-semibold">Max Value</span>
                                                <p className="text-sm font-mono font-medium text-slate-900 truncate" title={columnDetails[selectedColumn].stats.max || '-'}>
                                                    {columnDetails[selectedColumn].stats.max || '-'}
                                                </p>
                                            </div>
                                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                <span className="text-xs text-slate-500 uppercase font-semibold">Null Count</span>
                                                <p className="text-sm font-mono font-medium text-red-600">
                                                    {Math.round((columnDetails[selectedColumn].stats.null_percentage / 100) * columnDetails[selectedColumn].stats.count).toLocaleString()}
                                                </p>
                                            </div>
                                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                <span className="text-xs text-slate-500 uppercase font-semibold">Total Rows</span>
                                                <p className="text-sm font-mono font-medium text-slate-900">
                                                    {columnDetails[selectedColumn].stats.count.toLocaleString()}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Distribution Chart (Top Values) */}
                                        <div className="space-y-3 h-64">
                                            <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                                <BarChart3 className="w-4 h-4 text-indigo-500" />
                                                Top Distributions
                                            </h4>
                                            
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart 
                                                    data={columnDetails[selectedColumn].topValues}
                                                    layout="vertical"
                                                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                                    <XAxis type="number" hide />
                                                    <YAxis 
                                                        type="category" 
                                                        dataKey="value" 
                                                        width={100}
                                                        tick={{ fontSize: 10, fill: '#64748b' }}
                                                        tickFormatter={(val) => val == null ? 'NULL' : (val.toString().length > 15 ? val.toString().substring(0, 15) + '...' : val)}
                                                    />
                                                    <Tooltip 
                                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                    />
                                                    <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]}>
                                                        {columnDetails[selectedColumn].topValues.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center space-y-4">
                                    <PieChart className="w-16 h-16 opacity-20" />
                                    <p>Select a column from the list to view detailed statistics and distribution charts.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
}
