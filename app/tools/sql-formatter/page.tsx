"use client";

import React, { useState, useEffect } from "react";
import { Copy, Trash2, AlertCircle, Check, Database, ArrowLeft, Home, ChevronDown } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { format, SqlLanguage } from "sql-formatter";

const DIALECTS: { label: string; value: SqlLanguage }[] = [
  { label: "Standard SQL (ANSI)", value: "sql" },
  { label: "PostgreSQL", value: "postgresql" },
  { label: "Snowflake", value: "snowflake" },
  { label: "Oracle (PL/SQL)", value: "plsql" },
  { label: "SQL Server (T-SQL)", value: "transactsql" },
  { label: "DB2", value: "db2" },
  { label: "DuckDB", value: "postgresql" }, // Fallback to postgres for DuckDB
];

export default function SqlFormatter() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [dialect, setDialect] = useState<SqlLanguage>("snowflake");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!input.trim()) {
      setOutput("");
      setError(null);
      return;
    }

    try {
      const formatted = format(input, {
        language: dialect,
        tabWidth: 2,
        keywordCase: "upper",
        linesBetweenQueries: 2,
        paramTypes: dialect === 'snowflake' ? { named: ["@"] } : undefined,
      });
      setOutput(formatted);
      setError(null);
    } catch (err) {
      // SQL formatter is usually very forgiving, but just in case
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to format SQL");
      }
    }
  }, [input, dialect]);

  const handleCopy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
        console.error("Failed to copy", err);
    }
  };

  const handleClear = () => {
    setInput("");
    setOutput("");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 p-4 sm:p-8 font-sans">
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
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">SQL Formatter</h1>
                <p className="text-slate-500 text-sm">Beautify your queries for different engines</p>
              </div>
            </div>
          </div>

          <Link 
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-50"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </header>

        {/* content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-200px)] min-h-[500px]">
          
          {/* Input Section */}
          <section className="flex flex-col gap-2 h-full">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-4">
                <label htmlFor="sql-input" className="text-sm font-semibold text-slate-700">
                    Input SQL
                </label>
                
                {/* Dialect Selector */}
                <div className="relative group">
                    <select
                        value={dialect}
                        onChange={(e) => setDialect(e.target.value as SqlLanguage)} 
                        className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-medium py-1 pl-3 pr-8 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 hover:border-indigo-300 transition-colors cursor-pointer"
                    >
                        {DIALECTS.map((d) => (
                            <option key={d.label} value={d.value}>{d.label}</option>
                        ))}
                    </select>
                    <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                title="Clear input"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>
            <div className={cn(
                "relative flex-grow flex flex-col rounded-xl border bg-white shadow-sm transition-all focus-within:ring-2 focus-within:ring-indigo-500/20",
                error ? "border-red-300 ring-2 ring-red-500/10" : "border-slate-200 hover:border-indigo-300"
            )}>
              <textarea
                id="sql-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="SELECT * FROM table..."
                className="flex-grow w-full h-full p-4 resize-none bg-transparent border-none outline-none font-mono text-sm text-slate-800 placeholder:text-slate-400"
                spellCheck={false}
              />
              <AnimatePresence>
                {error && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-4 left-4 right-4 bg-red-50 text-red-600 px-3 py-2 rounded-lg text-xs font-medium border border-red-100 flex items-start gap-2 shadow-sm"
                    >
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2 break-all">{error}</span>
                    </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* Output Section */}
          <section className="flex flex-col gap-2 h-full">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-slate-700">
                Formatted SQL
              </span>
              <button
                onClick={handleCopy}
                disabled={!output}
                className={cn(
                    "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded transition-all",
                    !output 
                        ? "text-slate-300 cursor-not-allowed" 
                        : copied 
                            ? "text-green-600 bg-green-50" 
                            : "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
                )}
                title="Copy to clipboard"
              >
                {copied ? (
                    <>
                        <Check className="w-3.5 h-3.5" />
                        Copied!
                    </>
                ) : (
                    <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                    </>
                )}
              </button>
            </div>
            <div className="relative flex-grow rounded-xl border border-slate-200 bg-slate-50/50 shadow-inner overflow-hidden">
                {!output && !error ? (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-400 select-none pointer-events-none">
                        <span className="text-sm">Formatted query will appear here</span>
                    </div>
                ) : null}
              <textarea
                readOnly
                value={output}
                className="w-full h-full p-4 resize-none bg-transparent border-none outline-none font-mono text-sm text-slate-700"
                spellCheck={false}
              />
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
