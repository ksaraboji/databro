"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Trash2, Binary } from "lucide-react";
import FloatingHomeButton from "@/components/floating-home-button";

export default function Base64Converter() {
  const [inputText, setInputText] = useState("");
  const [mode, setMode] = useState<"encode" | "decode">("encode");
  const [copied, setCopied] = useState(false);

  const { outputText, error } = useMemo(() => {
    if (!inputText) return { outputText: "", error: null };

    try {
      if (mode === "encode") {
        // UTF-8 safe encoding
        const encoded = btoa(unescape(encodeURIComponent(inputText)));
        return { outputText: encoded, error: null };
      } else {
        // UTF-8 safe decoding
        const decoded = decodeURIComponent(escape(atob(inputText)));
        return { outputText: decoded, error: null };
      }
    } catch {
      return { 
        outputText: "", 
        error: mode === "encode" ? "Unable to encode text." : "Invalid Base64 string." 
      };
    }
  }, [inputText, mode]);

  const handleCopy = async () => {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const clearAll = () => {
    setInputText("");
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <FloatingHomeButton />
      
      <main className="max-w-4xl mx-auto p-4 sm:p-8 py-12 space-y-8">
        {/* Header */}
        <header className="space-y-4">
          <Link
            href="/tools"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Tools
          </Link>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
              <Binary className="w-8 h-8 text-cyan-500" />
              Base64 Encoder / Decoder
            </h1>
            <p className="text-slate-600 max-w-2xl">
              Convert text to Base64 and back instantly. Handles UTF-8 characters correctly.
              Everything happens in your browser—no data leaves your device.
            </p>
          </div>
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Controls */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-4 items-center justify-between">
            <div className="flex bg-slate-200 p-1 rounded-lg">
              <button
                onClick={() => setMode("encode")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  mode === "encode"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Encode
              </button>
              <button
                onClick={() => setMode("decode")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  mode === "decode"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Decode
              </button>
            </div>

            <button
              onClick={clearAll}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>

          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {/* Input Section */}
            <div className="p-4 sm:p-6 space-y-3">
              <label 
                htmlFor="input" 
                className="block text-sm font-medium text-slate-700"
              >
                {mode === "encode" ? "Text to Encode" : "Base64 to Decode"}
              </label>
              <textarea
                id="input"
                className="w-full h-64 p-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all resize-none placeholder:text-slate-400"
                placeholder={mode === "encode" ? "Type or paste text here..." : "Paste Base64 string here..."}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                spellCheck={false}
              />
            </div>

            {/* Output Section */}
            <div className="p-4 sm:p-6 space-y-3 bg-slate-50/30">
              <div className="flex items-center justify-between">
                 <label 
                  htmlFor="output" 
                  className="block text-sm font-medium text-slate-700"
                >
                  {mode === "encode" ? "Encoded Output" : "Decoded Text"}
                </label>
                {outputText && !error && (
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-xs font-medium text-cyan-600 hover:text-cyan-700 bg-cyan-50 hover:bg-cyan-100 px-2 py-1 rounded transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                )}
              </div>
              
              <div className="relative">
                 <textarea
                  id="output"
                  readOnly
                  className={`w-full h-64 p-4 rounded-lg border font-mono text-sm resize-none focus:outline-none ${
                    error 
                      ? "bg-red-50 border-red-200 text-red-600" 
                      : "bg-white border-slate-200 text-slate-600"
                  }`}
                  value={error || outputText}
                  placeholder="Output will appear here..."
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
