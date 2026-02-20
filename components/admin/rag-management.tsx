"use client";

import { useState } from "react";
import { Upload, Database, Check, AlertCircle, RefreshCw, Plus, Trash2 } from "lucide-react";

export default function RagManagement() {
  const [file, setFile] = useState<File | null>(null);
  const [topic, setTopic] = useState("General");
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"ingest" | "seed">("ingest");

  const gatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL || "https://api-gateway.victorioushill-531514fe.eastus.azurecontainerapps.io";

  const handleUpload = async () => {
    if (!file) {
      setMessage("Please select a file first.");
      setStatus("error");
      return;
    }

    setStatus("uploading");
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("topic", topic);

    try {
      const endpoint = mode; 
      const res = await fetch(`${gatewayUrl}/rag/${endpoint}`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setStatus("success");
        setMessage(endpoint === "seed" ? "Database reset & seeded successfully!" : "File ingested successfully!");
        setFile(null); 
      } else {
        setStatus("error");
        setMessage(`Error: ${res.statusText}`);
      }
    } catch (error) {
      setStatus("error");
      setMessage(String(error));
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header Tabs */}
        <div className="flex border-b border-slate-100">
            <button 
                onClick={() => { setMode("ingest"); setMessage(""); setStatus("idle"); }}
                className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${mode === "ingest" ? "bg-white text-indigo-600 border-b-2 border-indigo-600" : "bg-slate-50 text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}
            >
                <Plus className="w-4 h-4" /> Add Knowledge (Append)
            </button>
            <button 
                onClick={() => { setMode("seed"); setMessage(""); setStatus("idle"); }}
                className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${mode === "seed" ? "bg-red-50 text-red-600 border-b-2 border-red-600" : "bg-slate-50 text-slate-500 hover:text-slate-700 hover:bg-red-50"}`}
            >
                <Trash2 className="w-4 h-4" /> Reset & Seed (Overwrite)
            </button>
        </div>

        <div className="p-6 space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <div className={`p-3 rounded-xl ${mode === "seed" ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600"}`}>
                    <Database className="w-6 h-6" />
                </div>
                <div>
                     <h3 className="text-xl font-bold text-slate-900">
                        {mode === "ingest" ? "Append to Knowledge Base" : "Reset & Overwrite Knowledge Base"}
                     </h3>
                     <p className="text-sm text-slate-500">
                        {mode === "ingest" 
                            ? "Add new documents without removing existing data." 
                            : "⚠️ Warning: This will DELETE all existing vectors and start fresh."}
                     </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <label className="space-y-2 block">
                    <span className="text-sm font-medium text-slate-700">Topic Tag</span>
                    <input
                        type="text"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        placeholder={mode === "ingest" ? "e.g. Docker" : "e.g. Initial Knowledge Base"}
                    />
                </label>

                <label className="space-y-2 block">
                    <span className="text-sm font-medium text-slate-700">Upload Knowledge File</span>
                    <div className="relative">
                        <input 
                            type="file" 
                            accept=".txt,.md"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" 
                        />
                        <div className={`border-2 border-dashed rounded-lg p-6 transition-colors flex flex-col items-center justify-center text-center ${file ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-300 hover:bg-slate-50'}`}>
                            <Upload className={`w-8 h-8 mb-2 transition-colors ${file ? 'text-indigo-600' : 'text-slate-400'}`} />
                            {file ? (
                                <span className="text-sm text-indigo-700 font-bold truncate max-w-full px-4">{file.name}</span>
                            ) : (
                                <span className="text-xs text-slate-500">Drag & Drop or Click (TXT, MD)</span>
                            )}
                        </div>
                    </div>
                </label>
            </div>

            <div className="pt-4 border-t border-slate-100">
                 <button
                    onClick={handleUpload}
                    disabled={status === "uploading" || !file}
                    className={`w-full py-3 font-bold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        mode === "seed" 
                        ? "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-200" 
                        : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
                    }`}
                >
                    {status === "uploading" ? (
                        <>
                            <RefreshCw className="animate-spin w-5 h-5" />
                            {mode === "seed" ? "Resetting & Seeding..." : "Uploading & Ingesting..."}
                        </>
                    ) : (
                        <>
                            {mode === "seed" ? <Trash2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                            {mode === "seed" ? "Confirm Reset & Seed" : "Ingest Document"}
                        </>
                    )}
                </button>
            </div>

            {/* Status Messages */}
            {status === "success" && (
                <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-800 rounded-lg text-sm border border-emerald-100 animate-in fade-in slide-in-from-top-2">
                    <Check className="w-4 h-4 shrink-0" />
                    {message}
                </div>
            )}
            {status === "error" && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 text-red-800 rounded-lg text-sm border border-red-100 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {message}
                </div>
            )}
        </div>
    </div>
  );
}
