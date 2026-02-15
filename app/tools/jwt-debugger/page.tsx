"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Key, Lock, Check, X, Fingerprint, Clock, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function base64UrlDecode(str: string) {
    let output = str.replace(/-/g, "+").replace(/_/g, "/");
    switch (output.length % 4) {
        case 0:
            break;
        case 2:
            output += "==";
            break;
        case 3:
            output += "=";
            break;
        default:
            throw new Error("Illegal base64url string!");
    }
    return decodeURIComponent(escape(atob(output)));
}

export default function JWTDebuggerPage() {
    const [token, setToken] = useState("");
    const [header, setHeader] = useState<any>(null);
    const [payload, setPayload] = useState<any>(null);
    const [signature, setSignature] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<"valid" | "expired" | "invalid">("invalid");

    useEffect(() => {
        if (!token) {
            setHeader(null);
            setPayload(null);
            setSignature(null);
            setError(null);
            setStatus("invalid");
            return;
        }

        try {
            const parts = token.split(".");
            if (parts.length !== 3) {
                throw new Error("Invalid JWT format. Must have 3 parts separated by dots.");
            }

            const headerDecoded = JSON.parse(base64UrlDecode(parts[0]));
            const payloadDecoded = JSON.parse(base64UrlDecode(parts[1]));
            
            setHeader(headerDecoded);
            setPayload(payloadDecoded);
            setSignature(parts[2]);
            setError(null);

            // Check expiration
            if (payloadDecoded.exp) {
                const expirationDate = new Date(payloadDecoded.exp * 1000);
                if (expirationDate < new Date()) {
                    setStatus("expired");
                } else {
                    setStatus("valid");
                }
            } else {
                setStatus("valid"); // Valid structure, no expiration claim
            }

        } catch (e: any) {
            setError(e.message || "Failed to decode JWT");
            setHeader(null);
            setPayload(null);
            setSignature(null);
            setStatus("invalid");
        }
    }, [token]);

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
                            <Key className="w-10 h-10 text-cyan-600" />
                            JWT Debugger
                        </h1>
                        <p className="text-lg text-slate-600">
                            Decode, verify, and inspect JSON Web Tokens locally.
                        </p>
                    </motion.div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Column: Input */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="space-y-6"
                    >
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4 h-full flex flex-col">
                            <label className="block text-sm font-bold text-slate-900 uppercase tracking-wide">
                                Encoded Token
                            </label>
                            <textarea
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                placeholder="Paste your JWT here (header.payload.signature)"
                                className="w-full h-96 p-4 font-mono text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 focus:outline-none transition-all resize-none text-slate-700 break-all"
                            />
                            {/* Privacy Badge */}
                            <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex items-center justify-center gap-2 text-xs font-medium text-emerald-800">
                                <Lock className="w-3 h-3" />
                                Done locally in browser. No server calls.
                            </div>
                        </div>
                    </motion.div>

                    {/* Right Column: Output */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="space-y-6"
                    >
                         {/* Status Header */}
                         {token && !error && (
                            <div className={`p-4 rounded-xl border flex items-center gap-3 ${
                                status === 'valid' ? 'bg-green-50 border-green-100 text-green-800' : 
                                status === 'expired' ? 'bg-amber-50 border-amber-100 text-amber-800' : 
                                'bg-red-50 border-red-100 text-red-800'
                            }`}>
                                {status === 'valid' && <Check className="w-5 h-5" />}
                                {status === 'expired' && <Clock className="w-5 h-5" />}
                                {status === 'invalid' && <AlertTriangle className="w-5 h-5" />}
                                <span className="font-bold">
                                    {status === 'valid' && "Token Structure Valid"}
                                    {status === 'expired' && "Token Expired"}
                                    {status === 'invalid' && "Invalid Token"}
                                </span>
                            </div>
                         )}
                         
                         {error && token && (
                             <div className="p-4 rounded-xl border bg-red-50 border-red-100 text-red-800 flex items-center gap-3">
                                 <X className="w-5 h-5" />
                                 <span className="font-medium">{error}</span>
                             </div>
                         )}

                        {/* Decoded Header */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                Header
                            </div>
                            <div className="p-6">
                                {header ? (
                                    <pre className="text-sm font-mono text-rose-600 overflow-x-auto whitespace-pre-wrap">
                                        {JSON.stringify(header, null, 2)}
                                    </pre>
                                ) : (
                                    <div className="text-slate-300 italic text-sm">Waiting for input...</div>
                                )}
                            </div>
                        </div>

                        {/* Decoded Payload */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                Payload
                            </div>
                            <div className="p-6">
                            {payload ? (
                                    <pre className="text-sm font-mono text-violet-600 overflow-x-auto whitespace-pre-wrap">
                                        {JSON.stringify(payload, null, 2)}
                                    </pre>
                                ) : (
                                    <div className="text-slate-300 italic text-sm">Waiting for input...</div>
                                )}
                            </div>
                        </div>

                        {/* Signature Info */}
                         <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                Signature Verification
                            </div>
                            <div className="p-6 text-sm text-slate-500">
                                {signature ? (
                                    <div className="break-all font-mono text-cyan-600">
                                        {signature}
                                        <div className="mt-4 text-slate-400 text-xs font-sans">
                                            Note: Signature is not verified here as it requires your secret key. We only decode the structure.
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-slate-300 italic">Waiting for input...</div>
                                )}
                            </div>
                        </div>

                    </motion.div>
                </div>
            </div>
        </div>
    );
}
