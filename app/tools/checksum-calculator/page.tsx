"use client";

import React, { useState, useRef } from "react";
import { Copy, Upload, AlertCircle, Check, ArrowLeft, Home, FileText, Hash, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import CryptoJS from "crypto-js";

type HashAlgorithm = "MD5" | "SHA256";

const SAFE_FILE_SIZE_LIMIT_BYTES = 25 * 1024 * 1024;

const formatSizeMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function ChecksumCalculator() {
  const [file, setFile] = useState<File | null>(null);
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>("MD5");
  const [hash, setHash] = useState<string>("");
  const [lineCount, setLineCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (selectedFile: File) => {
    setLoading(true);
    setError(null);
    setHash("");
    setLineCount(null);

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== "string") {
            throw new Error("Failed to read file as text");
        }

        // Calculate Line Count
        // Split by newline and get length. 
        // Note: This counts lines. Empty file is 0 or 1? usually 0 if really empty, 1 if empty string?
        // Let's stick to standard behavior: split(/\r\n|\r|\n/).length
        const lines = text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length;
        setLineCount(lines);

        // Calculate Hash
        // For very large files, this might freeze the UI. 
        // Since we are assuming "text file" and "user uploaded", we'll assume reasonable size for now.
        // For production grade large file handling, we'd use chunks and WordArray.
        let calculatedHash = "";
        if (algorithm === "MD5") {
            calculatedHash = CryptoJS.MD5(text).toString();
        } else {
            calculatedHash = CryptoJS.SHA256(text).toString();
        }
        
        setHash(calculatedHash);
      } catch (err) {
        setError("Error processing file.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
        setError("Error reading file.");
        setLoading(false);
    };

    reader.readAsText(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
        if (selectedFile.size > SAFE_FILE_SIZE_LIMIT_BYTES) {
            setFile(null);
            setError(
                `File too large (${formatSizeMB(selectedFile.size)}). Recommended safe limit is ${formatSizeMB(SAFE_FILE_SIZE_LIMIT_BYTES)} for browser-side checksum generation.`
            );
            setHash("");
            setLineCount(null);
            setLoading(false);
            return;
        }
        setFile(selectedFile);
        processFile(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const selectedFile = e.dataTransfer.files?.[0];
    if (selectedFile) {
        if (selectedFile.size > SAFE_FILE_SIZE_LIMIT_BYTES) {
            setFile(null);
            setError(
                `File too large (${formatSizeMB(selectedFile.size)}). Recommended safe limit is ${formatSizeMB(SAFE_FILE_SIZE_LIMIT_BYTES)} for browser-side checksum generation.`
            );
            setHash("");
            setLineCount(null);
            setLoading(false);
            return;
        }
        setFile(selectedFile);
        processFile(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Re-calculate if algorithm changes and we have a file
  React.useEffect(() => {
    if (file) {
        processFile(file);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [algorithm]);

  const handleCopy = async () => {
    if (!hash) return;
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
        console.error("Failed to copy", err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
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
                <Hash className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">File Checksum</h1>
                <p className="text-slate-500 text-sm">Calculate MD5/SHA256 hashes and count lines</p>
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

        {/* Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left: Upload Area */}
            <div className="space-y-4">
                <div 
                    className={cn(
                        "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-colors h-64 cursor-pointer",
                        file ? "border-indigo-300 bg-indigo-50/30" : "border-slate-300 hover:border-indigo-400 bg-slate-50 hover:bg-white"
                    )}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        onChange={handleFileChange}
                        accept=".txt,.csv,.json,.sql,.log,.md,text/*"
                    />
                    
                    <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                        {file ? <FileText className="w-8 h-8 text-indigo-600" /> : <Upload className="w-8 h-8 text-slate-400" />}
                    </div>
                    
                    {file ? (
                        <div>
                            <p className="font-semibold text-slate-900 truncate max-w-[250px]">{file.name}</p>
                            <p className="text-sm text-slate-500">{(file.size / 1024).toFixed(2)} KB</p>
                            <p className="text-xs text-indigo-600 mt-2 font-medium">Click or Drop to replace</p>
                        </div>
                    ) : (
                        <div>
                            <p className="font-semibold text-slate-700">Click to upload or drag & drop</p>
                            <p className="text-sm text-slate-500 mt-1">Text files supported (TXT, CSV, JSON, LOG...)</p>
                            <p className="text-xs text-indigo-600 mt-1 font-medium">Recommended safe size: up to 25 MB per file</p>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                   <span className="text-sm font-medium text-slate-700">Algorithm</span>
                   <div className="flex gap-2">
                      {(["MD5", "SHA256"] as const).map((algo) => (
                          <button
                            key={algo}
                            onClick={() => setAlgorithm(algo)}
                            className={cn(
                                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all border",
                                algorithm === algo 
                                    ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" 
                                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                            )}
                          >
                              {algo}
                          </button>
                      ))}
                   </div>
                </div>
            </div>

            {/* Right: Results */}
            <div className="space-y-6">
                {/* Hash Result */}
                <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 flex items-center justify-between">
                        Generated Hash ({algorithm})
                        {hash && (
                             <button
                                onClick={handleCopy}
                                className={cn(
                                    "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded transition-all",
                                    copied 
                                        ? "text-green-600 bg-green-50" 
                                        : "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
                                )}
                            >
                                {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                            </button>
                        )}
                    </label>
                    <div className="relative">
                        <input 
                            readOnly 
                            value={loading ? "Calculating..." : hash || "Upload a file to generate hash"}
                            className={cn(
                                "w-full p-4 rounded-xl border bg-slate-50 font-mono text-base md:text-sm outline-none transition-all truncate selection:bg-indigo-100",
                                hash ? "text-slate-800 border-slate-200" : "text-slate-400 border-slate-200 italic"
                            )}
                        />
                         {loading && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <span className="block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Line Count Result */}
                <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Line Count</label>
                     <div className={cn(
                                "w-full p-4 rounded-xl border bg-slate-50 font-mono text-sm outline-none flex items-center gap-3",
                                lineCount !== null ? "text-slate-800 border-slate-200" : "text-slate-400 border-slate-200 italic"
                            )}>
                         <div className="p-1.5 bg-blue-100 text-blue-600 rounded-md">
                            <FileText className="w-4 h-4" />
                         </div>
                         <span className="font-semibold text-lg">
                             {loading ? "..." : lineCount !== null ? lineCount.toLocaleString() : "-"}
                         </span>
                         <span className="text-slate-400 font-normal text-xs ml-auto">lines</span>
                    </div>
                </div>

                {/* Status/Error */}
                <AnimatePresence>
                    {error && (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-medium border border-red-100 flex items-start gap-3"
                        >
                            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                            {error}
                        </motion.div>
                    )}
                 </AnimatePresence>
                 
                 {hash && !error && !loading && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm font-medium border border-green-100 flex items-center gap-3"
                    >
                        <CheckCircle2 className="w-5 h-5" />
                        <div>
                            <p>Calculation Complete</p>
                            <p className="text-xs text-green-600 opacity-80 mt-0.5">Processed locally in your browser.</p>
                        </div>
                    </motion.div>
                 )}
            </div>
        </div>
      </div>

        <p className="text-center text-slate-400 text-sm">Powered by crypto-js.</p>
    </div>
  );
}
