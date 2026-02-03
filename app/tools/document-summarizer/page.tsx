"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, FileText, File as FileIcon, Loader2, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from "mammoth";

// Set worker source for PDF.js
// We use unpkg to match the installed version dynamically if possible, preventing version mismatch errors.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

type Status = 'idle' | 'loading_model' | 'processing_file' | 'summarizing' | 'complete' | 'error';

export default function DocumentSummarizerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<string>(""); // For model loading text
  const [loadPercent, setLoadPercent] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Initialize Worker
    workerRef.current = new Worker(new URL('./worker.ts', import.meta.url), {
        type: 'module'
    });

    workerRef.current.onmessage = (event) => {
        const { type, payload } = event.data;

        if (type === 'progress') {
             setStatus('loading_model');
             setProgress(payload.text);
             setLoadPercent(payload.progress);
        } else if (type === 'ready') {
             // Model loaded, trigger summarization if text is ready
             if (text) {
                 startSummarization(text);
             } else {
                 setStatus('idle'); // Should ideally wait for file, but 'ready' means model is ready
             }
        } else if (type === 'update') {
             setSummary(payload);
        } else if (type === 'complete') {
             setSummary(payload);
             setStatus('complete');
        } else if (type === 'error') {
             setError(payload);
             setStatus('error');
        }
    };

    return () => {
        workerRef.current?.terminate();
    };
  }, []); // Only on mount. Note: 'text' dependency issues if we strictly followed it, but we use refs or direct calls.

  const extractTextFromPdf = async (file: File): Promise<string> => {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = "";
      // Limit pages to avoid browser hanging on massive docs
      const maxPages = Math.min(pdf.numPages, 10); 
      
      for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(" ");
          fullText += pageText + "\n";
      }
      
      if (pdf.numPages > 10) {
          fullText += "\n...[Document truncated after 10 pages]...";
      }
      
      return fullText;
  };

  const extractTextFromDocx = async (file: File): Promise<string> => {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      return result.value;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const selectedFile = e.target.files[0];
          setFile(selectedFile);
          setError(null);
          setSummary("");
          
          try {
              setStatus('processing_file');
              let extractedText = "";
              
              if (selectedFile.type === "application/pdf") {
                  extractedText = await extractTextFromPdf(selectedFile);
              } else if (selectedFile.type === "text/plain") {
                  extractedText = await selectedFile.text();
              } else if (selectedFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
                  extractedText = await extractTextFromDocx(selectedFile);
              } else {
                  throw new Error("Unsupported file type. Please upload PDF, DOCX, or TXT.");
              }
              
              if (extractedText.trim().length === 0) {
                  throw new Error("Could not extract text from file. It might be scanned image?");
              }

              setText(extractedText);
              
              // If model is already loaded (we can't easily query state here without keeping track), 
              // we rely on the fact that if we just send 'init', it might be redundant or handled.
              // Better: Send 'init' first always. If loaded, worker replies 'ready' immediately.
              if (workerRef.current) {
                  setStatus('loading_model');
                  workerRef.current.postMessage({ type: 'init' });
              }

          } catch (err: any) {
              setError(err.message);
              setStatus('error');
          }
      }
  };

  const startSummarization = (content: string) => {
      if (!workerRef.current) return;
      
      setStatus('summarizing');
      workerRef.current.postMessage({
          type: 'summarize',
          payload: { text: content }
      });
  };

  // Trigger summarization when text and worker are ready? 
  // We handle this inside use-effect 'ready' listener for the initial flow.
  // But if model was ALREADY ready from a previous run?
  // We need a way to know if ready.
  // Workaround: We always send 'init' on file load. The worker ignores resizing if valid.
  
  // Actually, the `useEffect` listener on 'ready' calls `startSummarization(text)`.
  // But the `text` inside `useEffect` closure is stale (initial empty string).
  // FIX: Use a ref for text or put `text` in dependency array?
  // Putting `text` in dependency array triggers re-registration of worker. Bad.
  // Use a useRef for text access inside event listener.
  
  const textRef = useRef("");
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Re-binding the listener to capture 'text' closure updates is messy. 
  // Better: The 'ready' handler just calls summarizing.
  // To allow the 'ready' handler to see current text, we use textRef.

  useEffect(() => {
    if (!workerRef.current) return;
    workerRef.current.onmessage = (event) => {
        const { type, payload } = event.data;

        if (type === 'progress') {
             setStatus('loading_model');
             setProgress(payload.text);
             setLoadPercent(payload.progress);
        } else if (type === 'ready') {
             if (textRef.current) {
                 // Trigger summarize
                 setStatus('summarizing');
                 workerRef.current?.postMessage({
                     type: 'summarize',
                     payload: { text: textRef.current }
                 });
             }
        } else if (type === 'update') {
             setStatus('summarizing');
             setSummary(payload);
        } else if (type === 'complete') {
             setSummary(payload);
             setStatus('complete');
        } else if (type === 'error') {
             setError(payload);
             setStatus('error');
        }
    };
  }, []);


  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 sm:p-8">
       <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-200">
           <div className="flex items-center gap-4">
                <Link href="/tools" className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="w-6 h-6 text-indigo-600" />
                    Document Summarizer
                    </h1>
                    <p className="text-slate-500 text-sm">Private, in-browser AI summarization</p>
                </div>
           </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Upload Area */}
            <div className="space-y-6">
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white p-8 rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all text-center group cursor-pointer relative"
                >
                    <input 
                        type="file" 
                        accept=".pdf,.txt,.docx" 
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                        <Upload className="w-8 h-8 text-indigo-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">Upload Document</h3>
                    <p className="text-slate-500 text-sm mt-1">
                        Support PDF, DOCX, or Text files. <br/>
                        Max ~10 pages recommended.
                    </p>
                </motion.div>

                {file && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4"
                    >
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                            {file.type === 'application/pdf' ? <FileText className="w-5 h-5 text-red-500" /> : 
                             file.type.includes('word') ? <FileText className="w-5 h-5 text-blue-500" /> :
                             <FileIcon className="w-5 h-5 text-slate-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-slate-800 truncate">{file.name}</h4>
                            <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                        {status === 'processing_file' && <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />}
                        {status === 'complete' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                    </motion.div>
                )}

                {/* Status / Error Panels */}
                <AnimatePresence>
                    {(status === 'loading_model' || status === 'summarizing') && (
                         <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3"
                         >
                             <div className="flex items-center justify-between text-sm font-medium text-slate-700">
                                 <span className="flex items-center gap-2">
                                     {status === 'loading_model' ? <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" /> : <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
                                     {status === 'loading_model' ? 'Loading AI Model...' : 'Generating Summary...'}
                                 </span>
                                 <span className="text-slate-400">{status === 'loading_model' ? `${Math.round(loadPercent)}%` : ''}</span>
                             </div>
                             {status === 'loading_model' && (
                                 <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                     <motion.div 
                                        className="h-full bg-indigo-500"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${loadPercent}%` }}
                                     />
                                 </div>
                             )}
                             {status === 'loading_model' && (
                                 <p className="text-xs text-slate-400 font-mono truncate">{progress}</p>
                             )}
                         </motion.div>
                    )}

                    {error && (
                         <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="bg-red-50 p-4 rounded-xl border border-red-100 text-red-800 flex items-start gap-3"
                         >
                             <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                             <div className="text-sm">
                                 <p className="font-bold">Error Processing Document</p>
                                 <p className="opacity-90">{error}</p>
                             </div>
                         </motion.div>
                    )}
                </AnimatePresence>

            </div>

             {/* Output Area */}
             <div className="bg-white rounded-2xl border border-slate-200 shadow-sm min-h-[400px] flex flex-col">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center rounded-t-2xl">
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Summary</h3>
                </div>
                
                <div className="p-6 flex-1 overflow-y-auto">
                    {summary ? (
                         <div className="prose prose-sm prose-slate max-w-none">
                             <div className="whitespace-pre-wrap">{summary}</div>
                         </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                            <FileText className="w-16 h-16 opacity-20" />
                            <p className="text-sm">Summary will appear here</p>
                        </div>
                    )}
                </div>
             </div>

        </div>
       </div>
    </div>
  );
}
