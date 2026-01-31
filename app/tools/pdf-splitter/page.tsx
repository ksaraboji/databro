"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, FileMinus, Loader2, AlertCircle, X, Download, MousePointerClick } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

export default function PDFSplitterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateThumbnails = async (file: File) => {
      setIsGeneratingThumbnails(true);
      setThumbnails([]);
      try {
          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument(arrayBuffer);
          const pdf = await loadingTask.promise;
          
          const thumbArray: string[] = [];
          
          for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const scale = 0.5; // Scale down for thumbnail
              const viewport = page.getViewport({ scale });
              
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;

              if (context) {
                  await page.render({
                      canvasContext: context,
                      viewport: viewport
                  }).promise;
                  
                  thumbArray.push(canvas.toDataURL());
              }
          }
          setThumbnails(thumbArray);
      } catch (err) {
          console.error("Thumbnail generation error:", err);
          // Non-critical error, don't stop the user
      } finally {
          setIsGeneratingThumbnails(false);
      }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.type !== "application/pdf") {
          setError("Please upload a valid PDF file.");
          return;
      }

      setFile(selected);
      setError(null);
      setSelectedIndices([]);
      setThumbnails([]);
      setIsProcessing(true);

      try {
          const buffer = await selected.arrayBuffer();
          const doc = await PDFDocument.load(buffer);
          setPageCount(doc.getPageCount());
          
          // Trigger thumbnail generation in background logic
          generateThumbnails(selected);
      } catch (err) {
          console.error(err);
          setError("Failed to parse PDF. It might be corrupted or password protected.");
          setFile(null);
      } finally {
          setIsProcessing(false);
      }
    }
  };

  const addPage = (index: number) => {
      setSelectedIndices(prev => [...prev, index]);
  };

  const removeSelectedPage = (indexInSelection: number) => {
      setSelectedIndices(prev => prev.filter((_, i) => i !== indexInSelection));
  };

  const moveSelectedPage = (index: number, direction: 'up' | 'down') => {
      if (direction === 'up' && index > 0) {
          const newIndices = [...selectedIndices];
          [newIndices[index - 1], newIndices[index]] = [newIndices[index], newIndices[index - 1]];
          setSelectedIndices(newIndices);
      } else if (direction === 'down' && index < selectedIndices.length - 1) {
          const newIndices = [...selectedIndices];
          [newIndices[index + 1], newIndices[index]] = [newIndices[index], newIndices[index + 1]];
          setSelectedIndices(newIndices);
      }
  };

  const addRange = () => {
      // Simple range adder could be implemented here, but for now click is fine
      // Or maybe "Select All"
      const all = Array.from({ length: pageCount }, (_, i) => i);
      setSelectedIndices(all);
  };

  const extractAndDownload = async () => {
    if (!file || selectedIndices.length === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
        const srcBuffer = await file.arrayBuffer();
        const srcDoc = await PDFDocument.load(srcBuffer);
        const newDoc = await PDFDocument.create();

        // copyPages returns an array of pages
        // We pass the list of indices we want to copy
        // Note: copyPages can take duplicated indices if we want to duplicate pages
        const copiedPages = await newDoc.copyPages(srcDoc, selectedIndices);
        
        copiedPages.forEach(page => newDoc.addPage(page));

        const pdfBytes = await newDoc.save();

         const now = new Date();
         const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
         const baseName = file.name.replace(/\.[^/.]+$/, "");
         const filename = `${baseName}_split_${timestamp}.pdf`;

         // Handle Download / Share
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         const blob = new Blob([pdfBytes as any], { type: "application/pdf" });
         const shareFile = new File([blob], filename, { type: "application/pdf" });

         // Try native sharing on supported mobile devices
         if (navigator.share && navigator.canShare && navigator.canShare({ files: [shareFile] })) {
             try {
                 await navigator.share({
                     files: [shareFile],
                     title: filename,
                 });
                 return; 
             } catch (err) {
                 console.log('Share cancelled or failed', err);
             }
         }

         // Fallback to Download
         const url = URL.createObjectURL(blob);
         const link = document.createElement("a");
         link.href = url;
         link.setAttribute("download", filename);

         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);

    } catch (err: unknown) {
        console.error(err);
        setError("Failed to generate new PDF.");
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8 py-12">
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
              <FileMinus className="w-10 h-10 text-pink-600" />
              PDF Splitter & Extractor
            </h1>
            <p className="text-lg text-slate-600">
              Extract specific pages from a PDF and merge them into a new document.
            </p>
          </motion.div>
        </header>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            
            {/* Left Column: Source */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[500px]"
            >
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="font-bold text-slate-900 uppercase tracking-wide text-sm">1. Source File</h2>
                </div>
                
                <div className="p-6 flex-1 flex flex-col">
                    {!file ? (
                        <div className="relative group flex-1">
                             <input 
                                type="file" 
                                accept="application/pdf"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                             />
                             <div className="h-full border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center p-8 text-center transition-all hover:border-pink-400 hover:bg-pink-50/10 gap-4">
                                <Upload className="w-12 h-12 text-slate-300 group-hover:text-pink-400 transition-colors" />
                                <div>
                                    <span className="font-bold text-slate-700 block text-lg">Upload PDF</span>
                                    <span className="text-sm text-slate-500">Click or drag and drop</span>
                                </div>
                             </div>
                        </div>
                    ) : (
                        <div className="space-y-6 flex-1 flex flex-col">
                            {/* File Info */}
                            <div className="bg-pink-50 p-4 rounded-xl flex items-center justify-between border border-pink-100">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-pink-200 shrink-0 text-pink-600 font-bold text-xs">
                                        PDF
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-bold text-slate-900 truncate">{file.name}</div>
                                        <div className="text-xs text-slate-500">{pageCount} pages detected</div>
                                    </div>
                                </div>
                                <button onClick={() => { setFile(null); setPageCount(0); setSelectedIndices([]); }} className="p-2 hover:bg-white rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Page Grid */}
                            <div className="flex-1 overflow-y-auto max-h-[500px] border border-slate-200 rounded-xl p-4 bg-slate-50">
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                                    {Array.from({ length: pageCount }).map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => addPage(i)}
                                            className="aspect-[3/4] bg-white rounded-lg border border-slate-200 hover:border-pink-500 hover:ring-2 hover:ring-pink-200 transition-all flex flex-col items-center justify-center relative group overflow-hidden shadow-sm"
                                        >
                                            {thumbnails[i] ? (
                                                <img 
                                                    src={thumbnails[i]} 
                                                    alt={`Page ${i + 1}`} 
                                                    className="w-full h-full object-contain p-1"
                                                />
                                            ) : (
                                                <div className="flex flex-col items-center gap-2">
                                                    {isGeneratingThumbnails ? <Loader2 className="w-4 h-4 animate-spin text-pink-400" /> : null}
                                                    <span className="font-mono text-sm font-medium text-slate-500 group-hover:text-pink-600">Page {i + 1}</span>
                                                </div>
                                            )}
                                            <div className="absolute inset-x-0 bottom-0 bg-pink-500/90 text-white text-xs py-1 opacity-0 group-hover:opacity-100 font-bold backdrop-blur-sm transition-opacity">
                                                ADD PAGE {i + 1}
                                            </div>
                                            
                                            {/* Selection Counter Badge if selected multiple times */}
                                            {selectedIndices.filter(idx => idx === i).length > 0 && (
                                                <div className="absolute top-2 right-2 w-6 h-6 bg-pink-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-md transform scale-100 transition-transform">
                                                    {selectedIndices.filter(idx => idx === i).length}
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="flex justify-between items-center text-xs text-slate-400">
                                <button onClick={addRange} className="hover:text-pink-600 underline">Add All Pages</button>
                                <span>Click pages to add to selection</span>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Right Column: Selection */}
             <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[500px]"
            >
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h2 className="font-bold text-slate-900 uppercase tracking-wide text-sm">2. Selected Pages</h2>
                    <span className="text-xs font-bold bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full">{selectedIndices.length}</span>
                </div>

                <div className="p-6 flex-1 flex flex-col">
                    {selectedIndices.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-4 min-h-[200px] border-2 border-dashed border-slate-100 rounded-xl">
                            <MousePointerClick className="w-12 h-12 opacity-50" />
                            <p className="text-sm">Select pages from the left to begin</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto max-h-[500px] mb-6 space-y-2 pr-2">
                             <AnimatePresence>
                                {selectedIndices.map((pageIndex, i) => (
                                    <motion.div
                                        key={`${pageIndex}-${i}`} // Use index in key to allow duplicate pages
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }} // Smooth collapse
                                        className="flex items-center gap-3 bg-white border border-slate-200 p-2 rounded-lg group shadow-sm"
                                    >
                                        <div className="flex flex-col gap-0.5 items-center justify-center text-slate-300">
                                           <button onClick={() => moveSelectedPage(i, 'up')} disabled={i === 0} className="hover:text-slate-600 disabled:opacity-0 transition-colors">▲</button>
                                           <button onClick={() => moveSelectedPage(i, 'down')} disabled={i === selectedIndices.length - 1} className="hover:text-slate-600 disabled:opacity-0 transition-colors">▼</button>
                                        </div>
                                        
                                        <div className="w-8 h-10 bg-slate-50 rounded border border-slate-200 flex items-center justify-center shrink-0">
                                            <span className="text-xs font-bold text-slate-600 font-mono">{pageIndex + 1}</span>
                                        </div>
                                        
                                        <div className="flex-1 text-sm text-slate-600 font-medium">
                                            Page {pageIndex + 1}
                                        </div>

                                        <button 
                                            onClick={() => removeSelectedPage(i)}
                                            className="p-1.5 hover:bg-red-50 rounded-md text-slate-300 hover:text-red-500 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </motion.div>
                                ))}
                             </AnimatePresence>
                        </div>
                    )}

                    {selectedIndices.length > 0 && (
                        <div className="pt-4 border-t border-slate-100">
                             <button
                                onClick={extractAndDownload}
                                disabled={isProcessing}
                                className={`w-full py-3 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                                    isProcessing
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-pink-600 hover:bg-pink-700 text-white shadow-lg shadow-pink-200 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]'
                                }`}
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" /> Processing...
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-5 h-5" /> Download PDF
                                    </>
                                )}
                            </button>
                            <button onClick={() => setSelectedIndices([])} className="w-full text-center text-xs text-slate-400 mt-3 hover:text-red-500 transition-colors">
                                Clear Selection
                            </button>
                        </div>
                    )}
                </div>

            </motion.div>

        </div>

        {/* Error Message */}
        {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-red-50 text-red-600 rounded-lg flex items-start gap-3 max-w-2xl mx-auto">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                    <span className="font-bold block">Error</span>
                    <span className="text-sm opacity-90">{error}</span>
                </div>
            </motion.div>
        )}

        <p className="text-center text-slate-400 text-sm">
            Powered by <a href="https://github.com/Hopding/pdf-lib" target="_blank" className="underline hover:text-slate-600">pdf-lib</a>.
            <br className="hidden sm:block"/> No data leaves your browser.
        </p>

      </div>
    </div>
  );
}
