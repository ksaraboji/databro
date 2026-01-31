"use client";

import Link from "next/link";
import { ArrowLeft, Construction } from "lucide-react";
import { motion } from "framer-motion";

export default function BackendProjects() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8 flex flex-col items-center justify-center text-center relative">
        <Link href="/" className="absolute top-6 left-6 sm:top-8 sm:left-8">
            <button className="p-3 rounded-full bg-white shadow-sm border border-slate-200 hover:bg-slate-50 transition-all hover:scale-105 active:scale-95 group">
              <ArrowLeft className="w-5 h-5 text-slate-600 group-hover:text-slate-900" />
            </button>
        </Link>
        
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", duration: 0.6 }}
            className="space-y-6 max-w-lg bg-white p-8 sm:p-12 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100"
        >
            <motion.div 
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="mx-auto w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100"
            >
                <Construction className="w-10 h-10 text-indigo-600" />
            </motion.div>
            
            <div className="space-y-2">
                <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">Backend Projects</h1>
                <div className="inline-block px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold uppercase tracking-wider rounded-full">
                    Under Construction
                </div>
            </div>

            <p className="text-slate-600 text-lg leading-relaxed">
                I&apos;m currently architecting this section. It&apos;s going to be packed with serverless patterns, distributed systems, and maybe a few over-engineered API endpoints.
            </p>
            
            <div className="pt-4">
                <Link href="/" className="text-indigo-600 font-semibold hover:text-indigo-700 hover:underline">
                    Return Home for now &rarr;
                </Link>
            </div>
        </motion.div>
    </div>
  );
}