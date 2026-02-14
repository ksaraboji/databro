"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, QrCode, Download, Settings, Trash2, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeCanvas } from "qrcode.react";

export default function QRCodeGeneratorPage() {
  const [content, setContent] = useState("");
  const [size, setSize] = useState(256);
  const [fgColor, setFgColor] = useState("#000000");
  const [bgColor, setBgColor] = useState("#FFFFFF");
  const [includeMargin, setIncludeMargin] = useState(true);
  const [level, setLevel] = useState<"L" | "M" | "Q" | "H">("H");
  
  const qrRef = useRef<HTMLDivElement>(null);

  const downloadQR = () => {
    if (!qrRef.current) return;
    const canvas = qrRef.current.querySelector("canvas");
    if (!canvas) return;

    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = `qrcode_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-8 py-12">
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
              <QrCode className="w-10 h-10 text-teal-600" />
              QR Code Generator
            </h1>
            <p className="text-lg text-slate-600">
              Create custom QR codes for URLs, text, or data completely offline.
            </p>
          </motion.div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Controls Panel */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-5 space-y-6"
          >
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
              
              <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-900 uppercase tracking-wide">
                  Content
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Enter URL, Text, Event details..."
                  className="w-full h-32 p-4 text-slate-800 border-2 border-slate-200 rounded-xl focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 focus:outline-none transition-all placeholder:text-slate-300 resize-none"
                  suppressHydrationWarning
                />
              </div>

               <div className="space-y-3">
                 <div className="flex items-center gap-2 mb-2 text-sm font-bold text-slate-900 uppercase tracking-wide">
                    <Settings className="w-4 h-4 text-slate-400" />
                    Customization
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Size (px)</label>
                        <input 
                            type="number" 
                            min="100" 
                            max="1000" 
                            value={size} 
                            onChange={(e) => setSize(Number(e.target.value))}
                            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                            suppressHydrationWarning
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Error Correction</label>
                        <select 
                            value={level} 
                            onChange={(e) => setLevel(e.target.value as any)}
                            className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                            suppressHydrationWarning
                        >
                            <option value="L">L (Low - 7%)</option>
                            <option value="M">M (Medium - 15%)</option>
                            <option value="Q">Q (Quartile - 25%)</option>
                            <option value="H">H (High - 30%)</option>
                        </select>
                     </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4 pt-2">
                     <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Foreground Color</label>
                        <div className="flex items-center gap-2 border border-slate-200 rounded-lg p-1">
                            <input 
                                type="color" 
                                value={fgColor} 
                                onChange={(e) => setFgColor(e.target.value)}
                                className="w-8 h-8 rounded cursor-pointer border-none bg-transparent p-0"
                            />
                            <span className="text-xs text-slate-500 font-mono">{fgColor}</span>
                        </div>
                     </div>
                     <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Background Color</label>
                        <div className="flex items-center gap-2 border border-slate-200 rounded-lg p-1">
                            <input 
                                type="color" 
                                value={bgColor} 
                                onChange={(e) => setBgColor(e.target.value)}
                                className="w-8 h-8 rounded cursor-pointer border-none bg-transparent p-0"
                            />
                            <span className="text-xs text-slate-500 font-mono">{bgColor}</span>
                        </div>
                     </div>
                 </div>

                 <div className="pt-2">
                     <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                        <input 
                            type="checkbox" 
                            checked={includeMargin} 
                            onChange={(e) => setIncludeMargin(e.target.checked)}
                            className="w-5 h-5 text-teal-600 rounded focus:ring-teal-500 border-gray-300"
                        />
                        <span className="text-sm font-medium text-slate-700">Include White Margin</span>
                     </label>
                 </div>
               </div>
            </div>
          </motion.div>

          {/* Preview Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-7 space-y-6"
          >
            <div className="bg-slate-100 rounded-2xl border-4 border-dashed border-slate-300 min-h-[400px] flex flex-col items-center justify-center p-8 relative overflow-hidden">
                {!content ? (
                    <div className="text-center space-y-4 opacity-50">
                        <QrCode className="w-24 h-24 mx-auto text-slate-400" />
                        <p className="text-slate-500 font-medium">Start typing to generate QR code...</p>
                    </div>
                ) : (
                    <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white p-4 shadow-xl rounded-xl"
                        ref={qrRef}
                    >
                        <QRCodeCanvas
                            value={content}
                            size={size}
                            fgColor={fgColor}
                            bgColor={bgColor}
                            level={level}
                            includeMargin={includeMargin}
                        />
                    </motion.div>
                )}
            </div>
            
            <div className="flex justify-end gap-3">
                 <button 
                    onClick={() => { setContent(""); setFgColor("#000000"); setBgColor("#FFFFFF"); }}
                    className="px-6 py-3 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-all flex items-center gap-2"
                 >
                     <Trash2 className="w-4 h-4" />
                     Reset
                 </button>
                 <button 
                    disabled={!content}
                    onClick={downloadQR}
                    className="px-8 py-3 rounded-xl font-bold text-white bg-teal-600 hover:bg-teal-700 shadow-lg shadow-teal-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                 >
                     <Download className="w-5 h-5" />
                     Download PNG
                 </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
