"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShoppingCart, Check, X, ShieldCheck, ShieldAlert, Binary } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function UPCEANValidatorPage() {
  const [inputValue, setInputValue] = useState("");
  const [validationResult, setValidationResult] = useState<{ isValid: boolean; type: string } | null>(null);

  // Check digit calculation for UPC/EAN (standard GTIN calculation)
  const validateBarcode = (code: string) => {
    // Remove non-numeric characters
    const digits = code.replace(/\D/g, "");

    // UPC-A is 12 digits, EAN-13 is 13 digits, GTIN-14 is 14 digits
    if (![8, 12, 13, 14].includes(digits.length)) {
      return { isValid: false, type: "Unknown length" };
    }

    // Calculation logic:
    // 1. Multiply each digit by 3 or 1, alternating, starting from the RIGHT (excluding check digit).
    // The last digit is the check digit.
    
    const dataDigits = digits.slice(0, -1);
    const checkDigit = parseInt(digits.slice(-1), 10);
    
    let sum = 0;
    // Iterate from right to left
    for (let i = 0; i < dataDigits.length; i++) {
        // Position from right (1-based index including check digit position context)
        // If length is even (like UPC-A 12), the last data digit (index 10) is position 2 (even).
        // Standard GTIN rule: multiply by 3 for odd positions from right, 1 for even positions from right.
        
        // Easier way: 
        // Reverse the data string.
        // Index 0 (original last digit): weight 3
        // Index 1 (original second last): weight 1
        // ...
        
        const digit = parseInt(dataDigits[dataDigits.length - 1 - i], 10);
        const weight = (i % 2 === 0) ? 3 : 1;
        sum += digit * weight;
    }
    
    const nearestTen = Math.ceil(sum / 10) * 10;
    const calculatedCheckDigit = nearestTen - sum;
    
    const isValid = calculatedCheckDigit === checkDigit;
    
    let type = "Unknown";
    if (digits.length === 12) type = "UPC-A (Universal Product Code)";
    if (digits.length === 13) type = "EAN-13 (International Article Number)";
    if (digits.length === 8) type = "EAN-8";
    if (digits.length === 14) type = "GTIN-14";

    return { isValid, type };
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, "");
    if (raw.length > 14) raw = raw.slice(0, 14);
    
    setInputValue(raw);
    
    if (raw.length >= 8) {
        setValidationResult(validateBarcode(raw));
    } else {
        setValidationResult(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-8 py-12">
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
              <ShoppingCart className="w-10 h-10 text-rose-600" />
              UPC / EAN Validator
            </h1>
            <p className="text-lg text-slate-600">
              Verify global trade item numbers (UPC, EAN, GTIN) check digits.
            </p>
          </motion.div>
        </header>

        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <div className="p-8 sm:p-12 space-y-8">
            <div className="space-y-4">
              <label htmlFor="upc-input" className="block text-sm font-bold text-slate-900 uppercase tracking-wide">
                Enter Barcode Number
              </label>
              <div className="relative">
                <input
                    id="upc-input"
                    type="text"
                    value={inputValue}
                    onChange={handleChange}
                    placeholder="e.g. 036000291452"
                    className="w-full text-2xl sm:text-4xl font-mono text-center tracking-widest p-6 border-2 border-slate-200 rounded-xl focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 focus:outline-none transition-all placeholder:text-slate-200 text-slate-800"
                />
                {inputValue && (
                    <button 
                        onClick={() => { setInputValue(""); setValidationResult(null); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                )}
              </div>
              <p className="text-sm text-slate-500 text-center">
                Supports UPC-A (12), EAN-13, EAN-8, and GTIN-14 formats.
              </p>
            </div>

            <AnimatePresence mode="wait">
                {validationResult && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`p-6 rounded-xl border-2 flex items-center gap-6 ${validationResult.isValid ? 'border-green-100 bg-green-50' : 'border-red-100 bg-red-50'}`}
                    >
                        <div className={`p-4 rounded-full ${validationResult.isValid ? 'bg-green-100' : 'bg-red-100'}`}>
                             {validationResult.isValid ? <ShieldCheck className="w-8 h-8 text-green-600" /> : <ShieldAlert className="w-8 h-8 text-red-600" />}
                        </div>
                        <div className="flex-1 space-y-1">
                            <h3 className={`text-xl font-bold ${validationResult.isValid ? 'text-green-800' : 'text-red-800'}`}>
                                {validationResult.isValid ? "Valid Checksum" : "Invalid Checksum"}
                            </h3>
                            <p className={`${validationResult.isValid ? 'text-green-700' : 'text-red-700'}`}>
                                {validationResult.type !== "Unknown length" 
                                    ? `This is a valid ${validationResult.type}.` 
                                    : "The length of the barcode does not match standard formats (8, 12, 13, or 14 digits)."}
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            
             <div className="pt-8 border-t border-slate-100 text-slate-500 text-sm leading-relaxed">
                 <strong>Logic:</strong> UPCs and EANs use a modulo-10 calculation where digits are weighted by 3 or 1 depending on their position. This is different from the Luhn algorithm used for credit cards.
            </div>

          </div>
        </motion.div>
      </div>
    </div>
  );
}
