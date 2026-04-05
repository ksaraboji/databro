"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CreditCard, ShieldCheck, ShieldAlert, X, Check, Lock, Fingerprint, Home } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AadhaarValidatorPage() {
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [isValid, setIsValid] = useState<boolean | null>(null);

  // Verhoeff algorithm tables
  const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  const inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

  const formatAadhaar = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    const parts = [];
    for (let i = 0; i < v.length; i += 4) {
      parts.push(v.substring(i, i + 4));
    }
    return parts.length > 1 ? parts.join(" ") : value;
  };

  const validateAadhaar = (aadhaar: string) => {
    // 1. Regular expression check (12 digits, not starting with 0 or 1 usually)
    if (!/^[2-9]{1}[0-9]{3}\s[0-9]{4}\s[0-9]{4}$/.test(aadhaar) && !/^[2-9]{1}[0-9]{11}$/.test(aadhaar.replace(/\s/g, ""))) {
         // Validates structure: 12 digits, can't start with 0 or 1
         return false; 
    }
    
    const array = aadhaar.replace(/\s/g, "").split("").map(Number).reverse();
    let c = 0;
    
    for (let i = 0; i < array.length; i++) {
        c = d[c][p[i % 8][array[i]]];
    }
    
    return c === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, "");
    if (raw.length > 12) raw = raw.slice(0, 12);

    const formatted = formatAadhaar(raw);
    setAadhaarNumber(formatted);
    
    if (raw.length === 12) {
        setIsValid(validateAadhaar(formatted));
    } else {
        setIsValid(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6 py-12">
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
                <Fingerprint className="w-8 h-8 text-orange-600" />
                Aadhaar Validator
              </h1>
              <p className="text-sm text-slate-500">
                Verify Indian Aadhaar (UIDAI) numbers using the Verhoeff algorithm.
              </p>
            </motion.div>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-orange-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-50"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </header>

        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
        >
          {/* Privacy Badge */}
          <div className="bg-emerald-50 border-b border-emerald-100 p-3 flex items-center justify-center gap-2 text-sm font-medium text-emerald-800">
            <Lock className="w-4 h-4" />
            Privacy First: Validations run locally. Numbers are never sent to any server.
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div className="space-y-4">
              <label htmlFor="aadhaar-input" className="block text-sm font-bold text-slate-900 uppercase tracking-wide">
                Enter 12-Digit Aadhaar
              </label>
              <div className="relative">
                <input
                    id="aadhaar-input"
                    type="text"
                    value={aadhaarNumber}
                    onChange={handleChange}
                    placeholder="0000 0000 0000"
                    className="w-full text-2xl sm:text-4xl font-mono text-center tracking-widest p-6 border-2 border-slate-200 rounded-xl focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 focus:outline-none transition-all placeholder:text-slate-200 text-slate-800"
                />
                {aadhaarNumber && (
                    <button 
                        onClick={() => { setAadhaarNumber(""); setIsValid(null); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                )}
              </div>
            </div>

            <AnimatePresence mode="wait">
                {isValid !== null && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`p-6 rounded-xl border-2 flex items-center gap-6 ${isValid ? 'border-green-100 bg-green-50' : 'border-red-100 bg-red-50'}`}
                    >
                        <div className={`p-4 rounded-full ${isValid ? 'bg-green-100' : 'bg-red-100'}`}>
                             {isValid ? <ShieldCheck className="w-8 h-8 text-green-600" /> : <ShieldAlert className="w-8 h-8 text-red-600" />}
                        </div>
                        <div className="flex-1 space-y-1">
                            <h3 className={`text-xl font-bold ${isValid ? 'text-green-800' : 'text-red-800'}`}>
                                {isValid ? "Valid Aadhaar Number" : "Invalid Aadhaar Number"}
                            </h3>
                            <p className={`${isValid ? 'text-green-700' : 'text-red-700'}`}>
                                {isValid 
                                    ? "This number passes the Verhoeff checksum validation." 
                                    : "This number failed the Verhoeff checksum or format validation."}
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            
            <div className="pt-8 border-t border-slate-100 text-slate-500 text-sm leading-relaxed">
                 <strong>How it works:</strong> Aadhaar uses the <strong>Verhoeff algorithm</strong> for its checksum, which detects all single-digit errors and all transposition errors (swapping two adjacent digits). Unlike Luhn (used in credit cards), Verhoeff uses complex permutation tables based on dihedral group D5.
            </div>

          </div>
        </motion.div>
      </div>

        <p className="text-center text-slate-400 text-sm">Powered by Verhoeff Algorithm.</p>
    </div>
  );
}
