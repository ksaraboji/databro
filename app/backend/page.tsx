"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function BackendProjects() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setSummary(null);
      setError(null);
    }
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
    <div className="min-h-screen bg-slate-50 font-sans p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-8 py-12">
        <header className="space-y-4 text-center sm:text-left">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
              Backend Services
            </h1>
            <p className="text-lg text-slate-600">
              Interact directly with the microservices powering this platform.
            </p>
          </motion.div>
        </header>

        <div className="grid gap-8">
            {/* Project 1: Document Summarizer */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
            >
                <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-start justify-between">
                        <div className="space-y-1">
                            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-600" />
                                Intelligent Document Summarizer
                            </h2>
                            <p className="text-slate-600 text-sm">
                                Upload a PDF or Word document to extract text and generate a concise summary using Llama 3.2.
                            </p>
                        </div>
                        <div className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold uppercase rounded-full">
                            Live Demo
                        </div>
                    </div>
                </div>

                <div className="p-6 sm:p-8 space-y-6">
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors relative group">
                        <input 
                            type="file" 
                            onChange={handleFileChange}
                            accept=".pdf,.docx,.txt,.md"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="space-y-4 pointer-events-none group-hover:scale-105 transition-transform duration-200">
                            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto text-indigo-600">
                                <Upload className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-slate-900 font-bold text-lg">
                                    {file ? file.name : "Click to upload or drag and drop"}
                                </p>
                                <p className="text-slate-500 text-sm mt-1">
                                    Supports PDF, DOCX, TXT (Max 5MB)
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-slate-100">
                        <button
                            onClick={handleSummarize}
                            disabled={!file || loading}
                            className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <FileText className="w-4 h-4" />
                                    Generate Summary
                                </>
                            )}
                        </button>
                    </div>

                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3"
                            >
                                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                                <div className="text-red-800 text-sm font-medium">{error}</div>
                            </motion.div>
                        )}

                        {summary && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-emerald-50 border border-emerald-100 rounded-xl p-6 space-y-4 shadow-sm"
                            >
                                <div className="flex items-center gap-2 text-emerald-800 font-bold border-b border-emerald-200 pb-2">
                                    <CheckCircle2 className="w-5 h-5" />
                                    Summary Generated Successfully
                                </div>
                                <div className="prose prose-sm prose-emerald max-w-none text-emerald-900/90 leading-relaxed whitespace-pre-wrap">
                                    {summary}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
      </div>
    </div>
  );
}