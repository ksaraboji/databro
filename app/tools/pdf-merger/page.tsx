"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, FileText, Loader2, AlertCircle, X, Download, Share2, Home } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PDFDocument } from 'pdf-lib';

const SAFE_FILE_SIZE_LIMIT_BYTES = 50 * 1024 * 1024;
const SAFE_TOTAL_SIZE_LIMIT_BYTES = 200 * 1024 * 1024;

const formatSizeMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function PDFMergerPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [isMerging, setIsMerging] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      const validPdfFiles = selectedFiles.filter(file => file.type === "application/pdf");
      const oversizedFiles = validPdfFiles.filter((file) => file.size > SAFE_FILE_SIZE_LIMIT_BYTES);
      const acceptedFiles = validPdfFiles.filter((file) => file.size <= SAFE_FILE_SIZE_LIMIT_BYTES);

      const existingTotal = files.reduce((sum, file) => sum + file.size, 0);
      let runningTotal = existingTotal;
      const filesWithinTotalLimit: File[] = [];
      for (const file of acceptedFiles) {
        if (runningTotal + file.size <= SAFE_TOTAL_SIZE_LIMIT_BYTES) {
          filesWithinTotalLimit.push(file);
          runningTotal += file.size;
        }
      }

      const skippedNonPdf = validPdfFiles.length !== selectedFiles.length;
      const skippedOversized = oversizedFiles.length > 0;
      const skippedTotalLimit = filesWithinTotalLimit.length !== acceptedFiles.length;

      if (skippedNonPdf || skippedOversized || skippedTotalLimit) {
        const issues: string[] = [];
        if (skippedNonPdf) issues.push("non-PDF files");
        if (skippedOversized) issues.push(`files over ${formatSizeMB(SAFE_FILE_SIZE_LIMIT_BYTES)}`);
        if (skippedTotalLimit) issues.push(`total size above ${formatSizeMB(SAFE_TOTAL_SIZE_LIMIT_BYTES)}`);
        setError(`Some files were skipped: ${issues.join(", ")}.`);
      } else {
        setError(null);
      }

      if (filesWithinTotalLimit.length > 0) {
        setFiles((prev) => [...prev, ...filesWithinTotalLimit]);
      }
    }
    // Reset input
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
      if (direction === 'up' && index > 0) {
          const newFiles = [...files];
          [newFiles[index - 1], newFiles[index]] = [newFiles[index], newFiles[index - 1]];
          setFiles(newFiles);
      } else if (direction === 'down' && index < files.length - 1) {
          const newFiles = [...files];
          [newFiles[index + 1], newFiles[index]] = [newFiles[index], newFiles[index + 1]];
          setFiles(newFiles);
      }
  };

  const mergePDFs = async () => {
    if (files.length < 2) {
        setError("Please select at least 2 PDF files to merge.");
        return;
    }

    setIsMerging(true);
    setError(null);

    try {
        const mergedPdf = await PDFDocument.create();

        for (const file of files) {
            const fileBuffer = await file.arrayBuffer();
            const pdf = await PDFDocument.load(fileBuffer);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }

        const mergedPdfBytes = await mergedPdf.save();
        
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
        const baseName = files[0].name.replace(/\.[^/.]+$/, "");
        const filename = `${baseName}_merged_${timestamp}.pdf`;

        // Merge & Download should always trigger a direct file download.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blob = new Blob([mergedPdfBytes as any], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

    } catch (err: unknown) {
        console.error(err);
        setError("Failed to merge PDFs. One of the files might be corrupted or password protected.");
    } finally {
        setIsMerging(false);
    }
  };

    const mergeAndSharePDFs = async () => {
        if (files.length < 2) {
            setError("Please select at least 2 PDF files to merge.");
            return;
        }

        setIsSharing(true);
        setError(null);

        try {
            const mergedPdf = await PDFDocument.create();

            for (const file of files) {
                const fileBuffer = await file.arrayBuffer();
                const pdf = await PDFDocument.load(fileBuffer);
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            }

            const mergedPdfBytes = await mergedPdf.save();

            const now = new Date();
            const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
            const baseName = files[0].name.replace(/\.[^/.]+$/, "");
            const filename = `${baseName}_merged_${timestamp}.pdf`;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const blob = new Blob([mergedPdfBytes as any], { type: "application/pdf" });
            const shareFile = new File([blob], filename, { type: "application/pdf" });

            if (navigator.share && navigator.canShare && navigator.canShare({ files: [shareFile] })) {
                await navigator.share({
                    files: [shareFile],
                    title: filename,
                });
                return;
            }

            // Fallback when native share isn't available.
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err: unknown) {
            console.error(err);
            setError("Failed to merge/share PDFs. One of the files might be corrupted or password protected.");
        } finally {
            setIsSharing(false);
        }
    };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 font-sans">
    <div className="max-w-3xl mx-auto space-y-6 py-12">
        {/* Header */}
                <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4">
                        <Link
                            href="/tools"
                            className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-900"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-2 text-left"
                        >
                            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                                <FileText className="w-8 h-8 text-red-600" />
                                PDF Merger
                            </h1>
                            <p className="text-sm text-slate-500">
                                Combine multiple PDF files into a single document. Reorder pages by dragging files.
                            </p>
                        </motion.div>
                    </div>

                    <Link
                        href="/"
                        className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-50"
                    >
                        <Home className="w-4 h-4" />
                        <span className="hidden sm:inline">Home</span>
                    </Link>
                </header>

        {/* Main Card */}
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
        >
            <div className="p-6 sm:p-8 space-y-6">
                
                {/* File Upload */}
                <div className="space-y-4">
                    <label className="block text-sm font-bold text-slate-900 uppercase tracking-wide">
                        1. Add PDF Files
                    </label>
                    <div className="relative group">
                         <input 
                            type="file" 
                            accept="application/pdf"
                            multiple
                            onChange={handleFileChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                         />
                         <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center transition-all hover:border-red-400 hover:bg-red-50/10 group-hover:border-red-400">
                            <div className="flex flex-col items-center gap-3 text-slate-500">
                                <Upload className="w-8 h-8 opacity-50 text-red-500" />
                                <div>
                                    <span className="font-medium text-slate-700">Click to upload</span> or drag and drop
                                </div>
                                <span className="text-xs opacity-70">
                                    Supports PDF files only
                                </span>
                                <span className="text-xs text-red-600 font-medium">
                                    Recommended safe size: up to 50 MB per file, 200 MB total
                                </span>
                            </div>
                         </div>
                    </div>
                </div>

                {/* File List */}
                <AnimatePresence>
                    {files.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-bold text-slate-900 uppercase tracking-wide">
                                    2. Organize Files ({files.length})
                                </label>
                                <button onClick={() => setFiles([])} className="text-xs text-red-600 hover:underline">Clear All</button>
                            </div>
                            
                            <div className="space-y-2">
                                {files.map((file, index) => (
                                    <motion.div
                                        key={`${file.name}-${index}`}
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="flex items-center gap-3 bg-slate-50 border border-slate-200 p-3 rounded-lg group"
                                    >
                                        <div className="flex flex-col gap-1 items-center justify-center text-slate-300">
                                           <button onClick={() => moveFile(index, 'up')} disabled={index === 0} className="hover:text-slate-600 disabled:opacity-0 transition-colors">▲</button>
                                           <button onClick={() => moveFile(index, 'down')} disabled={index === files.length - 1} className="hover:text-slate-600 disabled:opacity-0 transition-colors">▼</button>
                                        </div>
                                        
                                        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200 shrink-0">
                                            <FileText className="w-5 h-5 text-red-500" />
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-slate-900 truncate" title={file.name}>{file.name}</div>
                                            <div className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                                        </div>

                                        <button 
                                            onClick={() => removeFile(index)}
                                            className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Action */}
                {files.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="pt-4"
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                onClick={mergePDFs}
                                disabled={isMerging || isSharing || files.length < 2}
                                className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                                    isMerging || isSharing || files.length < 2
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-200 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]'
                                }`}
                            >
                                {isMerging ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" /> Merging...
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-5 h-5" /> Merge & Download
                                    </>
                                )}
                            </button>

                            <button
                                onClick={mergeAndSharePDFs}
                                disabled={isSharing || isMerging || files.length < 2}
                                className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                                    isSharing || isMerging || files.length < 2
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-200 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]'
                                }`}
                            >
                                {isSharing ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" /> Merging...
                                    </>
                                ) : (
                                    <>
                                        <Share2 className="w-5 h-5" /> Merge & Share
                                    </>
                                )}
                            </button>
                        </div>
                        {files.length < 2 && (
                            <p className="text-center text-xs text-slate-400 mt-2">Add at least 2 files to merge</p>
                        )}
                    </motion.div>
                )}

                {/* Error Message */}
                {error && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-red-50 text-red-600 rounded-lg flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                            <span className="font-bold block">Error</span>
                            <span className="text-sm opacity-90">{error}</span>
                        </div>
                    </motion.div>
                )}

            </div>
        </motion.div>

        {/* Info Footer */}
        <p className="text-center text-slate-400 text-sm">
            Powered by <a href="https://github.com/Hopding/pdf-lib" target="_blank" className="underline hover:text-slate-600">pdf-lib</a>.
        </p>

      </div>
    </div>
  );
}
