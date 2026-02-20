"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ProfessorLesson from "@/components/backend/professor-lesson";

export default function ProfessorPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 p-4 sm:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8 py-8 h-full flex flex-col">
        {/* Header */}
        <header className="space-y-4">
          <Link
            href="/backend"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Backend Services
          </Link>
          
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-950">
              Professor AI
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl leading-relaxed">
              Interactive learning sessions powered by RAG and LLMs.
            </p>
          </div>
        </header>

        {/* Feature Component */}
        <div className="flex-1">
            <ProfessorLesson />
        </div>
      </div>
    </div>
  );
}
