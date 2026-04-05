"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link"; // For back button
import { ArrowLeft, Upload, FileText, Check, Copy, Download, Share2, RefreshCw, AlertCircle, Home } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import mammoth from "mammoth"; // For DOCX

type PdfJsLike = {
  version: string;
  GlobalWorkerOptions: { workerSrc: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<any> };
};

let pdfjsPromise: Promise<PdfJsLike> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePdfJsModule(mod: any): PdfJsLike | null {
  if (!mod || typeof mod !== "object") return null;

  const candidates = [mod, mod.default];
  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === "object" &&
      typeof candidate.getDocument === "function" &&
      candidate.GlobalWorkerOptions
    ) {
      return candidate as PdfJsLike;
    }
  }

  return null;
}

async function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const moduleLoaders = [
        () => import('pdfjs-dist/legacy/build/pdf.min.mjs'),
        () => import('pdfjs-dist/build/pdf.min.mjs'),
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let lastError: any = null;
      for (const loadModule of moduleLoaders) {
        try {
          const mod = await loadModule();
          const pdfjsLib = normalizePdfJsModule(mod);
          if (pdfjsLib) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;
            return pdfjsLib;
          }
        } catch (err) {
          lastError = err;
        }
      }

      throw lastError ?? new Error("Unable to load pdfjs-dist module");
    })();
  }

  try {
    return await pdfjsPromise;
  } catch (err) {
    pdfjsPromise = null;
    throw err;
  }
}

type ConversionStatus = "idle" | "converting" | "success" | "error";

const SAFE_FILE_SIZE_LIMIT_BYTES = 25 * 1024 * 1024;

const formatSizeMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function DocToMarkdownPage() {
  const [file, setFile] = useState<File | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [status, setStatus] = useState<ConversionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [copied, setCopied] = useState(false);

  const normalizeInlineWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

  const inlineNodeToMarkdown = (node: ChildNode): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const content = Array.from(el.childNodes).map(inlineNodeToMarkdown).join("");

    if (tag === "strong" || tag === "b") return `**${content}**`;
    if (tag === "em" || tag === "i") return `*${content}*`;
    if (tag === "code") return `\`${content}\``;
    if (tag === "br") return "  \n";
    if (tag === "a") {
      const href = el.getAttribute("href") ?? "";
      return href ? `[${content || href}](${href})` : content;
    }
    if (tag === "img") {
      const src = el.getAttribute("src") ?? "";
      const alt = el.getAttribute("alt") || "Image";
      return src ? `![${alt}](${src})` : "";
    }

    return content;
  };

  const listToMarkdown = (listEl: HTMLElement, depth = 0): string => {
    const ordered = listEl.tagName.toLowerCase() === "ol";
    const start = Number(listEl.getAttribute("start") ?? "1") || 1;
    const indent = "  ".repeat(depth);

    const lines: string[] = [];
    let index = start;

    const directItems = Array.from(listEl.children).filter(
      (child) => child.tagName.toLowerCase() === "li"
    );

    for (const item of directItems) {
      const li = item as HTMLElement;
      const marker = ordered ? `${index}.` : "-";

      const inlineChildren = Array.from(li.childNodes).filter((child) => {
        return !(child.nodeType === Node.ELEMENT_NODE && ["ul", "ol"].includes((child as HTMLElement).tagName.toLowerCase()));
      });
      const inlineText = normalizeInlineWhitespace(inlineChildren.map(inlineNodeToMarkdown).join(""));

      lines.push(`${indent}${marker} ${inlineText || "(empty)"}`);

      const nestedLists = Array.from(li.children).filter((child) => ["ul", "ol"].includes(child.tagName.toLowerCase()));
      for (const nested of nestedLists) {
        lines.push(listToMarkdown(nested as HTMLElement, depth + 1).trimEnd());
      }

      index += 1;
    }

    return lines.join("\n") + "\n";
  };

  // --- HTML to Markdown Converter (DOM-based for better list fidelity) ---
  const convertHtmlToMarkdown = (html: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const blocks: string[] = [];
    const toBlockMarkdown = (node: ChildNode) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = normalizeInlineWhitespace(node.textContent ?? "");
        if (text) blocks.push(text);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
        const level = Number(tag.replace("h", ""));
        const text = normalizeInlineWhitespace(Array.from(el.childNodes).map(inlineNodeToMarkdown).join(""));
        if (text) blocks.push(`${"#".repeat(level)} ${text}`);
        return;
      }

      if (tag === "p") {
        const text = normalizeInlineWhitespace(Array.from(el.childNodes).map(inlineNodeToMarkdown).join(""));
        if (text) blocks.push(text);
        return;
      }

      if (tag === "ul" || tag === "ol") {
        blocks.push(listToMarkdown(el).trimEnd());
        return;
      }

      if (tag === "pre") {
        const codeText = el.textContent ?? "";
        blocks.push(`\`\`\`\n${codeText}\n\`\`\``);
        return;
      }

      const text = normalizeInlineWhitespace(Array.from(el.childNodes).map(inlineNodeToMarkdown).join(""));
      if (text) blocks.push(text);
    };

    Array.from(doc.body.childNodes).forEach(toBlockMarkdown);
    return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
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
    const pdfjsLib = await loadPdfJs();
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

        // Keep PDF.js text stream order to reduce column/table reordering artifacts.
        // We still group adjacent items into lines using Y proximity and `hasEOL` hints.
        const orderedItems = textItems;

        // Group into lines based on Y-coordinate proximity
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lines: any[][] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let currentLine: any[] = [];
        let currentY = -1;

        for (const item of orderedItems) {
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

          if (item.hasEOL && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = [];
            currentY = -1;
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
    if (selectedFile.size > SAFE_FILE_SIZE_LIMIT_BYTES) {
      setFile(null);
      setMarkdown("");
      setCopied(false);
      setStatus("error");
      setErrorMessage(
        `File too large (${formatSizeMB(selectedFile.size)}). Recommended safe limit is ${formatSizeMB(SAFE_FILE_SIZE_LIMIT_BYTES)} for browser-side conversion.`
      );
      return;
    }

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
      } else if (fileType === "txt") {
        result = await selectedFile.text();
      } else {
        throw new Error("Unsupported file format. Please use .docx, .pdf, or .txt");
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

  const handleCopy = async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
      setErrorMessage("Clipboard access failed. You can still download the Markdown file.");
      setStatus("error");
    }
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

  const handleShare = async () => {
    if (!markdown) return;

    const fileName = (file?.name.replace(/\.[^/.]+$/, "") || "converted") + ".md";
    const markdownFile = new File([markdown], fileName, { type: "text/markdown" });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [markdownFile] })) {
      try {
        await navigator.share({
          files: [markdownFile],
          title: fileName,
        });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        console.warn("Share failed, falling back to download", err);
      }
    }

    // Fallback for unsupported/failed share flows.
    handleDownload();
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6 py-12">
        
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
                <FileText className="w-8 h-8 text-blue-600" />
                Doc to Markdown
              </h1>
              <p className="text-sm text-slate-500">
                Convert Word documents and PDFs into clean Markdown for your LLM prompts or documentation.
              </p>
            </motion.div>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-50"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
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
                  Supports .docx, .pdf, and .txt
                </p>
                <p className="text-xs text-amber-600 font-medium">
                  Recommended safe size: up to 25 MB per file for smooth browser-side conversion.
                </p>
              </div>
              
              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".docx,.pdf,.txt"
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
                    <button
                      onClick={handleShare}
                      disabled={!markdown}
                      className="p-2 bg-slate-900 text-white rounded-lg shadow-sm hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Share .md file"
                    >
                      <Share2 className="w-4 h-4" />
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

        <p className="text-center text-slate-400 text-sm">Powered by Mammoth and PDF.js.</p>
    </div>
  );
}
