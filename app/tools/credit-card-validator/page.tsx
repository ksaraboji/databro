"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CreditCard, ShieldCheck, ShieldAlert, X, Check, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function CreditCardValidatorPage() {
  const [cardNumber, setCardNumber] = useState("");
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [cardType, setCardType] = useState<string>("");

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    const parts = [];
    for (let i = 0; i < v.length; i += 4) {
      parts.push(v.substring(i, i + 4));
    }
    return parts.length > 1 ? parts.join(" ") : value;
  };

  const luhnCheck = (val: string) => {
    let checksum = 0; // running checksum total
    let j = 1; // takes value of 1 or 2

    // Process each digit one by one starting from the last
    for (let i = val.length - 1; i >= 0; i--) {
      let calc = 0;
      // Extract the next digit and multiply by 1 or 2 on alternative digits.
      calc = Number(val.charAt(i)) * j;

      // If the result is in two digits add 1 to the checksum total
      if (calc > 9) {
        checksum = checksum + 1;
        calc = calc - 10;
      }

      // Add the units element to the checksum total
      checksum = checksum + calc;

      // Switch the value of j
      if (j == 1) {
        j = 2;
      } else {
        j = 1;
      }
    }

    //Check if it is divisible by 10 or not.
    return checksum % 10 == 0;
  };

  const detectCardType = (number: string) => {
    const re = {
      electron: /^(4026|417500|4405|4508|4844|4913|4917)\d+$/,
      maestro: /^(5018|5020|5038|5612|5893|6304|6759|6761|6762|6763|0604|6390)\d+$/,
      dankort: /^(5019)\d+$/,
      interpayment: /^(636)\d+$/,
      unionpay: /^(62|88)\d+$/,
      visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
      mastercard: /^5[1-5][0-9]{14}$/,
      amex: /^3[47][0-9]{13}$/,
      diners: /^3(?:0[0-5]|[68][0-9])[0-9]{11}$/,
      discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/,
      jcb: /^(?:2131|1800|35\d{3})\d{11}$/,
    };

    if (re.electron.test(number)) return "Visa Electron";
    if (re.maestro.test(number)) return "Maestro";
    if (re.dankort.test(number)) return "Dankort";
    if (re.interpayment.test(number)) return "InterPayment";
    if (re.unionpay.test(number)) return "UnionPay";
    if (re.visa.test(number)) return "Visa";
    if (re.mastercard.test(number)) return "Mastercard";
    if (re.amex.test(number)) return "American Express";
    if (re.diners.test(number)) return "Diners Club";
    if (re.discover.test(number)) return "Discover";
    if (re.jcb.test(number)) return "JCB";
    
    return "Unknown Network";
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, "");
    
    // Limit max length commonly found in CCs (19 digits max usually)
    if (raw.length > 19) raw = raw.slice(0, 19);

    setCardNumber(formatCardNumber(raw));
    
    if (raw.length < 13) {
        setIsValid(null);
        setCardType("");
        return;
    }

    setIsValid(luhnCheck(raw));
    setCardType(detectCardType(raw));
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
              <CreditCard className="w-10 h-10 text-violet-600" />
              Credit Card / Luhn Validator
            </h1>
            <p className="text-lg text-slate-600">
              Verify if a credit card number is algorithmically valid using the Luhn check.
            </p>
          </motion.div>
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
            Privacy First: Validations run entirely in your browser. Numbers are never sent to any server.
          </div>

          <div className="p-8 sm:p-12 space-y-8">
            <div className="space-y-4">
              <label htmlFor="cc-input" className="block text-sm font-bold text-slate-900 uppercase tracking-wide">
                Enter Card Number
              </label>
              <div className="relative">
                <input
                    id="cc-input"
                    type="text"
                    value={cardNumber}
                    onChange={handleChange}
                    placeholder="0000 0000 0000 0000"
                    className="w-full text-2xl sm:text-4xl font-mono text-center tracking-widest p-6 border-2 border-slate-200 rounded-xl focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 focus:outline-none transition-all placeholder:text-slate-200 text-slate-800"
                />
                {cardNumber && (
                    <button 
                        onClick={() => { setCardNumber(""); setIsValid(null); setCardType(""); }}
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
                                {isValid ? "Valid Card Number" : "Invalid Card Number"}
                            </h3>
                            <p className={`${isValid ? 'text-green-700' : 'text-red-700'}`}>
                                {isValid 
                                    ? "This number passes the Luhn algorithmic check." 
                                    : "This number failed the Luhn checksum validation."}
                            </p>
                        </div>
                        {cardType && (
                             <div className="text-right border-l-2 border-dashed pl-6 ml-2 border-black/10">
                                 <div className="text-xs uppercase font-bold text-black/40 mb-1">Network</div>
                                 <div className="text-lg font-bold text-slate-800 whitespace-nowrap">{cardType}</div>
                             </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
            
            <div className="pt-8 border-t border-slate-100 text-slate-500 text-sm leading-relaxed">
                 <strong>How it works:</strong> The Luhn algorithm (or "modulus 10" algorithm) is a simple checksum formula used to validate a variety of identification numbers, such as credit card numbers, IMEI numbers, and more. It distinguishes valid numbers from arbitrary random digits.
            </div>

          </div>
        </motion.div>
      </div>
    </div>
  );
}
