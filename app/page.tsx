"use client";

import Link from "next/link";
import { ArrowRight, Workflow, Cpu, Bot } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import VisitorCounter from "@/components/visitor-counter";

export default function Home() {
  return (
    <div className="flex flex-col items-center min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 px-3 sm:px-6 lg:px-8">
      <VisitorCounter />
      <motion.main
        initial={{ opacity: 0 }}
        animate={{
          opacity: 1,
          transition: { staggerChildren: 0.2, delayChildren: 0.1 },
        }}
        className="flex-grow flex flex-col items-center justify-center w-full max-w-4xl lg:max-w-5xl space-y-8 sm:space-y-10 lg:space-y-12 py-12 sm:py-20 md:py-28 lg:py-32"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.5 } }}
          className="space-y-6 text-center"
        >
          <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-9xl font-black tracking-tighter text-slate-950 drop-shadow-sm">
            Data<span className="text-indigo-600">bro</span>.
          </h1>

          <div className="flex flex-col sm:flex-row md:flex-row items-center justify-center gap-2 sm:gap-3 md:gap-6 mt-3 sm:mt-4 lg:mt-6">
            <div className="flex items-center gap-2 text-slate-700 font-medium text-sm sm:text-base md:text-lg lg:text-xl">
              <Workflow
                className="w-4 h-4 sm:w-5 sm:h-5"
                style={{ color: "#2563eb" }}
              />
              <span>Data Engineer by Day</span>
            </div>

            <div className="hidden md:block h-6 w-px bg-slate-300"></div>
            <div className="md:hidden w-8 sm:w-10 h-px bg-slate-300"></div>

            <div className="flex items-center gap-2 text-slate-700 font-medium text-sm sm:text-base md:text-lg lg:text-xl">
              <Bot
                className="w-4 h-4 sm:w-5 sm:h-5"
                style={{ color: "#a855f7" }}
              />
              <span>AI Tinkerer by Night</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.5 } }}
          className="space-y-6 sm:space-y-8 max-w-xs sm:max-w-md md:max-w-2xl mx-auto text-center px-3 sm:px-4 lg:px-6"
        >
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-slate-600 leading-relaxed font-light">
            <span className="font-bold text-slate-900 block mb-2 text-xl sm:text-2xl md:text-3xl lg:text-4xl">
              Hi, I&apos;m the guy who breaks pipelines... then fixes them.
            </span>
            Professionally, I engineer robust data infrastructure that powers
            decisions. Unofficially? I’m obsessed with teaching AI to do cool
            stuff (and occasionally arguing with LLMs).
          </p>

          <div className="bg-white/60 border border-indigo-100 p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl shadow-lg shadow-indigo-100/50 backdrop-blur-md group hover:shadow-xl transition-shadow duration-300">
            <p className="text-xs sm:text-sm md:text-base text-slate-600 italic leading-relaxed">
              &quot;This portfolio is my sandbox—a mix of polished engineering and
              chaotic weekend experiments. While I build the main exhibit, I&apos;ve
              left some power tools out for you to play with.&quot;
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.5 } }}
          className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 pt-4 w-full sm:w-auto px-3"
        >
          <Link href="/tools" className="w-full sm:w-auto">
            <button
              className={cn(
                "rounded-full h-12 sm:h-14 md:h-16 px-6 sm:px-8 md:px-10 text-sm sm:text-base md:text-lg font-bold",
                "bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800",
                "hover:scale-105 active:scale-95 transition-all",
                "shadow-lg md:shadow-xl shadow-indigo-200 text-white",
                "flex items-center justify-center gap-2 w-full sm:w-auto",
              )}
            >
              <span className="hidden sm:inline">Your CPU, Not Mine</span>
              <span className="sm:hidden">Client-Side</span>
              <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
            </button>
          </Link>

          <Link href="/backend" className="w-full sm:w-auto">
            <button
              className={cn(
                "rounded-full h-12 sm:h-14 md:h-16 px-6 sm:px-8 md:px-10 text-sm sm:text-base md:text-lg font-bold",
                "bg-white border-2 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50",
                "text-slate-700 hover:text-indigo-700",
                "hover:scale-105 active:scale-95 transition-all",
                "shadow-sm hover:shadow-md",
                "flex items-center justify-center gap-2 w-full sm:w-auto",
              )}
            >
              <span>Burning My Credits</span>
            </button>
          </Link>

          <Link href="/visualizations" className="w-full sm:w-auto">
             <button
              className={cn(
                "rounded-full h-12 sm:h-14 md:h-16 px-6 sm:px-8 md:px-10 text-sm sm:text-base md:text-lg font-bold",
                "bg-white border-2 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50",
                "text-slate-700 hover:text-indigo-700",
                "hover:scale-105 active:scale-95 transition-all",
                "shadow-sm hover:shadow-md",
                "flex items-center justify-center gap-2 w-full sm:w-auto",
              )}
            >
              <span>Data Stories</span>
            </button>
          </Link>
        </motion.div>

        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.2 } }}
           className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 pt-2 w-full sm:w-auto px-3"
        >
          <Link href="/learning" className="w-full sm:w-auto">
            <button
              className={cn(
                "rounded-full h-10 sm:h-12 px-6 text-sm font-semibold",
                "bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                "text-slate-600 hover:text-slate-900",
                "hover:scale-105 active:scale-95 transition-all",
                "shadow-sm hover:shadow-md",
                "flex items-center justify-center gap-2 w-full sm:w-auto",
              )}
            >
              <span className="hidden sm:inline">Brain Dump</span>
              <span className="sm:hidden">Notes</span>
            </button>
          </Link>

          <Link href="/writing" className="w-full sm:w-auto">
            <button
              className={cn(
                "rounded-full h-10 sm:h-12 px-6 text-sm font-semibold",
                "bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                "text-slate-600 hover:text-slate-900",
                "hover:scale-105 active:scale-95 transition-all",
                "shadow-sm hover:shadow-md",
                "flex items-center justify-center gap-2 w-full sm:w-auto",
              )}
            >
              <span className="hidden sm:inline">Build Logs</span>
              <span className="sm:hidden">Logs</span>
            </button>
          </Link>
        </motion.div>

        <div className="border border-slate-300 text-slate-500 px-3 sm:px-4 py-1.5 rounded-full uppercase tracking-widest text-xs font-semibold bg-white/50 flex items-center gap-2 whitespace-nowrap mt-4 sm:mt-0">
          <Cpu className="w-3 h-3" />
          Warning: Useful code
        </div>
      </motion.main>
    </div>
  );
}
