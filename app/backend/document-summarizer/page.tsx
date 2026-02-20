"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, FileText, CheckCircle2, AlertCircle, Loader2, Copy, Download, Home, BookOpen, Bot, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function DocumentSummarizer() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setSummary(null);
      setError(null);
      setCopied(false);
    }
  };

  const handleCopy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const handleDownload = () => {
    if (!summary) return;
    const blob = new Blob([summary], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `summary-${file?.name || "document"}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  const handleSummarize = async () => {
    if (!file) return;

    setLoading(true);
    setSummary(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Assuming API Gateway is proxied or directly reachable
      const response = await fetch("https://api-gateway.victorioushill-531514fe.eastus.azurecontainerapps.io/summarize", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = "Failed to summarize document";
        try {
            const errorData = await response.json();
            errorMessage = errorData.detail || errorMessage;
        } catch {}
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setSummary(data.summary);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex items-center justify-between pb-6 border-b border-slate-200">
          <div className="flex items-center gap-4">
             <Link 
                href="/backend"
                className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-900"
             >
                <ArrowLeft className="w-5 h-5" />
             </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Document Summarizer</h1>
                <p className="text-slate-500 text-sm">LLM-powered analysis</p>
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

        {/* Main Content */}
        <div className="space-y-8">
          
          {/* Upload Section */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Upload className="w-5 h-5 text-indigo-600" />
              Upload Document
            </h2>
            
            <div className={cn(
              "border-2 border-dashed rounded-xl p-8 transition-all duration-300 text-center relative",
              file ? "border-indigo-500 bg-indigo-50/30" : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50",
              loading && "pointer-events-none opacity-50"
            )}>
              <input
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.docx,.txt"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              
              <div className="flex flex-col items-center gap-3">
                {file ? (
                  <>
                    <div className="p-3 bg-indigo-100 rounded-full text-indigo-600">
                      <FileText className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{file.name}</p>
                      <p className="text-sm text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        setFile(null);
                      }}
                      className="text-sm text-red-500 hover:text-red-600 font-medium z-10"
                    >
                      Remove file
                    </button>
                  </>
                ) : (
                  <>
                    <div className="p-3 bg-slate-100 rounded-full text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-500 transition-colors">
                      <Upload className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">Click to upload or drag and drop</p>
                      <p className="text-sm text-slate-500 mt-1">PDF, DOCX, or TXT (Max 10MB)</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSummarize}
                disabled={!file || loading}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-white transition-all shadow-md hover:shadow-lg",
                  !file || loading 
                    ? "bg-slate-300 cursor-not-allowed" 
                    : "bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-0.5"
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Bot className="w-5 h-5" />
                    Generate Summary
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results Section */}
          <AnimatePresence>
            {summary && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 pt-4 border-t border-slate-200"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    Analysis Result
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopy}
                      className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Copy to clipboard"
                    >
                      {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={handleDownload}
                      className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Download Markdown"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="prose prose-slate max-w-none bg-white p-6 rounded-xl border border-slate-200 shadow-sm leading-relaxed">
                  <div className="whitespace-pre-wrap">{summary}</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}