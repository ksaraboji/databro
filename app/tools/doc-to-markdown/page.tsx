"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link"; // For back button
import { ArrowLeft, Upload, FileText, Check, Copy, Download, RefreshCw, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from "mammoth"; // For DOCX

// Initialize PDF.js worker
if (typeof window !== "undefined" && 'Worker' in window) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
}

type ConversionStatus = "idle" | "converting" | "success" | "error";

export default function DocToMarkdownPage() {
  const [file, setFile] = useState<File | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [status, setStatus] = useState<ConversionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [copied, setCopied] = useState(false);

  // --- HTML to Markdown Converter (Simple) ---
  const convertHtmlToMarkdown = (html: string): string => {
    // 1. Clean up whitespace
    let md = html.replace(/\n/g, " "); // Remove existing newlines in HTML to avoid confusion
    
    // 2. Headings
    md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n");
    md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n");
    md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n");
    md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "\n#### $1\n");
    md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "\n##### $1\n");
    md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "\n###### $1\n");

    // 3. Paragraphs (double newline)
    md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "\n$1\n");
    md = md.replace(/<br\s*\/?>/gi, "  \n");

    // 4. Bold / Italic
    md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
    md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
    md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
    md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");

    // 5. Lists (Basic support)
    // This is tricky with regex because valid HTML lists are nested.
    // We'll do a simple pass for <li>. A true parser is better but this is a lightweight tool.
    // Mammoth outputs <ul><li>...</li></ul>.
    md = md.replace(/<ul[^>]*>/gi, "\n");
    md = md.replace(/<\/ul>/gi, "\n");
    md = md.replace(/<ol[^>]*>/gi, "\n");
    md = md.replace(/<\/ol>/gi, "\n");
    md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");

    // 6. Links / Images
    md = md.replace(/<a[^>]*href="(.*?)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
    md = md.replace(/<img[^>]*src="(.*?)"[^>]*>/gi, "![Image]($1)");

    // 7. Decode HTML entities (basic)
    md = md
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");

    // 8. Trim aggregation
    return md.replace(/\n\s*\n/g, "\n\n").trim();
  };

  // Helper to remove control characters that confuse editors
  const cleanText = (str: string) => {
    // Remove control characters but keep: \n (10), \r (13).
    // range 0-31 basically, but we want 10,13.
    // Also remove Delete (127).
    return str.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, "");
  };

  // --- PDF Extraction ---
  const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    let fullText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = textContent.items as any[];
        if (items.length === 0) continue;

        // Filter out empty strings
        const textItems = items.filter(item => item.str.trim().length > 0);
        if (textItems.length === 0) continue;

        const heights = textItems.map(item => item.transform[3] || item.height || 0);
        // Simple median height calculation
        heights.sort((a, b) => a - b);
        const medianHeight = heights[Math.floor(heights.length / 2)] || 12;

        let pageMd = "";

        // --- Better Strategy: Group by Rows ---
        // Sort by Y (descending) then X (ascending)
        // PDF coordinates: Y increases upwards. So larger Y is higher on page.
        textItems.sort((a, b) => {
             // Round Y to avoid float jitter (e.g. 500.0001 vs 500.0002)
             const yA = Math.round(a.transform[5]); 
             const yB = Math.round(b.transform[5]);
             
             if (yA !== yB) return yB - yA; // Sort top-to-bottom (Desc Y)
             return a.transform[4] - b.transform[4]; // Sort left-to-right (Asc X)
        });

        // Group into lines based on Y-coordinate proximity
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lines: any[][] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let currentLine: any[] = [];
        let currentY = -1;

        for (const item of textItems) {
            const itemY = Math.round(item.transform[5]);
            
            if (currentY === -1) {
                currentY = itemY;
                currentLine.push(item);
            } else if (Math.abs(currentY - itemY) < (medianHeight * 0.5)) {
                // Same line
                currentLine.push(item);
            } else {
                // New line
                lines.push(currentLine);
                currentLine = [item];
                currentY = itemY;
            }
        }
        if (currentLine.length > 0) lines.push(currentLine);

        // Process lines to Markdown
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (let l = 0; l < lines.length; l++) {
            const line = lines[l];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let lineText = line.map((item: any) => item.str).join(" ").replace(/\s\s+/g, ' ').trim();
            // Clean text
            lineText = cleanText(lineText);
            
            if (!lineText) continue;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const maxLineHeight = Math.max(...line.map((i: any) => i.transform[3]));
            
            // Header detection
            if (maxLineHeight > medianHeight * 1.5) {
                pageMd += `\n## ${lineText}\n`;
            } else if (maxLineHeight > medianHeight * 1.15) {
                pageMd += `\n### ${lineText}\n`;
            } else {
                pageMd += `${lineText}\n`;
            }

            // Paragraph detection (check gap to next line)
            if (l < lines.length - 1) {
                 const currentLineY = line[0].transform[5];
                 const nextLineY = lines[l+1][0].transform[5];
                 const gap = currentLineY - nextLineY; // Positive because current is higher
                 
                 if (gap > (medianHeight * 2)) {
                     pageMd += "\n"; 
                 }
            }
        }
        
        fullText += `\n<!-- Page ${i} -->\n${pageMd}`;
    }

    return fullText;
  };

  // --- File Handler ---
  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setStatus("converting");
    setErrorMessage(null);
    setMarkdown("");
    setCopied(false);

    try {
      const fileType = selectedFile.name.split('.').pop()?.toLowerCase();
      let result = "";

      if (fileType === "docx") {
        const arrayBuffer = await selectedFile.arrayBuffer();
        // Convert to HTML first to preserve structure
        const { value: html, messages } = await mammoth.convertToHtml({ arrayBuffer });
        
        if (messages.length > 0) {
            console.log("Mammoth messages:", messages);
        }
        
        result = convertHtmlToMarkdown(html);

      } else if (fileType === "pdf") {
        result = await extractTextFromPdf(selectedFile);
      } else if (fileType === "txt" || fileType === "md") {
        result = await selectedFile.text();
      } else {
        throw new Error("Unsupported file format. Please use .docx or .pdf");
      }

      setMarkdown(result);
      setStatus("success");
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to convert file");
      setStatus("error");
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (file?.name.replace(/\.[^/.]+$/, "") || "converted") + ".md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-8 py-12">
        
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
              <FileText className="w-10 h-10 text-blue-600" />
              Doc to Markdown
            </h1>
            <p className="text-lg text-slate-600">
              Convert Word documents and PDFs into clean Markdown for your LLM prompts or documentation.
            </p>
          </motion.div>
        </header>

        {/* Upload Area */}
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <div 
            className={`p-10 border-b border-slate-100 text-center transition-colors ${dragActive ? 'bg-blue-50' : 'bg-white'}`}
            onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
            onDragOver={(e) => { e.preventDefault(); }} // Necessary for onDrop
            onDrop={onDrop}
          >
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="p-4 bg-blue-50 rounded-full text-blue-600">
                <Upload className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900">
                  {file ? file.name : "Upload a document"}
                </h3>
                <p className="text-sm text-slate-500">
                  Drag and drop or click to browse
                </p>
                <p className="text-xs text-slate-400">
                  Supports .docx and .pdf
                </p>
              </div>
              
              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".docx,.pdf,.txt,.md"
                onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
              />
              
              <button
                onClick={() => document.getElementById('file-upload')?.click()}
                className="px-6 py-2.5 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm shadow-slate-200"
              >
                {file ? "Choose Another File" : "Select File"}
              </button>
            </div>
          </div>
          
          {/* Status & Error */}
          <div className="bg-slate-50/50 p-4 border-b border-slate-100 min-h-[60px] flex items-center justify-center">
             <AnimatePresence mode="wait">
                {status === 'converting' && (
                    <motion.div 
                        key="converting"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-2 text-blue-600 font-medium"
                    >
                        <RefreshCw className="w-4 h-4 animate-spin" /> Converting...
                    </motion.div>
                )}
                {status === 'error' && (
                    <motion.div
                        key="error"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-2 text-red-600 font-medium"
                    >
                         <AlertCircle className="w-4 h-4" /> {errorMessage}
                    </motion.div>
                )}
                {status === 'success' && (
                    <motion.div
                        key="success"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-2 text-green-600 font-medium"
                    >
                        <Check className="w-4 h-4" /> Conversion Complete!
                    </motion.div>
                )}
                {status === 'idle' && !file && (
                     <span className="text-slate-400 text-sm">Ready to convert</span>
                )}
             </AnimatePresence>
          </div>

          {/* Editor / Preview with Toolbar */}
          <div className="relative group">
               {/* Toolbar */}
               <div className="absolute top-4 right-4 flex items-center gap-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={handleCopy}
                        disabled={!markdown}
                        className="p-2 bg-white/90 backdrop-blur border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Copy to Clipboard"
                    >
                        {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={!markdown}
                        className="p-2 bg-slate-900 text-white rounded-lg shadow-sm hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Download .md file"
                    >
                        <Download className="w-4 h-4" />
                    </button>
               </div>

               <textarea
                  readOnly // Focusing on output for now. Editable in future?
                  value={markdown}
                  placeholder="Markdown output will appear here..."
                  className="w-full h-[500px] p-6 sm:p-8 bg-white font-mono text-sm text-slate-800 resize-none outline-none selection:bg-blue-100"
               />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
