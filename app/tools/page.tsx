"use client";

import Link from "next/link";
import { ArrowLeft, FileJson, Construction, Database, Hash, FileSpreadsheet, FileText, FileMinus, Binary, FileArchive, Activity, TrendingUp, Utensils } from "lucide-react";
import { motion } from "framer-motion";
import FloatingHomeButton from "@/components/floating-home-button";

type Tool = {
  name: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  color: string;
};

type Category = {
  id: string;
  title: string;
  tools: Tool[];
};

const toolCategories: Category[] = [
  {
    id: "conversion",
    title: "Data Conversion",
    tools: [
      {
        name: "File Converter & Query Tool",
        description: "Convert between Parquet, CSV, Excel, Arrow, and Avro formats, or query files directly with SQL.",
        icon: <FileSpreadsheet className="w-8 h-8 text-orange-600" />,
        href: "/tools/universal-converter",
        color: "bg-orange-50 hover:bg-orange-100",
      },
      {
        name: "PDF Merger",
        description: "Combine multiple PDF files into a single document comfortably in your browser.",
        icon: <FileText className="w-8 h-8 text-red-600" />,
        href: "/tools/pdf-merger",
        color: "bg-red-50 hover:bg-red-100",
      },
      {
        name: "PDF Splitter & Extractor",
        description: "Extract, reorder, and save specific pages from your PDF documents.",
        icon: <FileMinus className="w-8 h-8 text-pink-600" />,
        href: "/tools/pdf-splitter",
        color: "bg-pink-50 hover:bg-pink-100",
      },
      {
        name: "Doc to Markdown",
        description: "Convert Word documents and PDFs into clean Markdown for LLMs.",
        icon: <FileText className="w-8 h-8 text-blue-600" />,
        href: "/tools/doc-to-markdown",
        color: "bg-blue-50 hover:bg-blue-100",
      },
    ],
  },
  {
    id: "inspection",
    title: "Data Inspection",
    tools: [
      {
        name: "JSON Pretty Print",
        description: "Format, validate, and beautify your raw JSON data instantly.",
        icon: <FileJson className="w-8 h-8 text-indigo-600" />,
        href: "/tools/json-formatter",
        color: "bg-indigo-50 hover:bg-indigo-100",
      },
      {
        name: "SQL Formatter",
        description: "Beautify complex SQL queries for Snowflake, Postgres, and more.",
        icon: <Database className="w-8 h-8 text-blue-600" />,
        href: "/tools/sql-formatter",
        color: "bg-blue-50 hover:bg-blue-100",
      },
    ],
  },
  {
    id: "utilities",
    title: "Utilities & Encoding",
    tools: [
      {
        name: "Base64 Encoder / Decoder",
        description: "Convert text to Base64 and back instantly with UTF-8 support.",
        icon: <Binary className="w-8 h-8 text-cyan-600" />,
        href: "/tools/base64-converter",
        color: "bg-cyan-50 hover:bg-cyan-100",
      },
      {
        name: "Secure Zip Creator",
        description: "Compress files into password-protected ZIP archives safely in your browser.",
        icon: <FileArchive className="w-8 h-8 text-amber-600" />,
        href: "/tools/secure-zip",
        color: "bg-amber-50 hover:bg-amber-100",
      },
      {
        name: "Checksum Calculator",
        description: "Generate MD5/SHA256 hashes and count lines for text files locally.",
        icon: <Hash className="w-8 h-8 text-emerald-600" />,
        href: "/tools/checksum-calculator",
        color: "bg-emerald-50 hover:bg-emerald-100",
      },
    ],
  },
  {
    id: "visualization",
    title: "Visualization & Analysis",
    tools: [
      {
        name: "Data Profiler & Explorer",
        description: "Upload your dataset to instantly see stats, distributions, and missing value reports.",
        icon: <Activity className="w-8 h-8 text-indigo-600" />,
        href: "/tools/data-profiler",
        color: "bg-indigo-50 hover:bg-indigo-100",
      },
      {
        name: "Future Income Calculator",
        description: "Project your financial freedom timeline, inflation impact, and investment gaps in USD & INR.",
        icon: <TrendingUp className="w-8 h-8 text-emerald-600" />,
        href: "/tools/future-income-calculator",
        color: "bg-emerald-50 hover:bg-emerald-100",
      },
    ],
  },
];

export default function ToolsPage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-indigo-50/50 p-4 sm:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-12 py-12">
        <header className="space-y-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900">
              The Workbench
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl">
              A collection of utilities to help you wrangle data, debug pipelines,
              and save your sanity.
            </p>
          </motion.div>
        </header>

        <div className="space-y-16">
          {toolCategories.map((category, catIndex) => (
            <section key={category.id} className="space-y-6">
              <motion.div
                 initial={{ opacity: 0, x: -20 }}
                 whileInView={{ opacity: 1, x: 0 }}
                 viewport={{ once: true }}
                 transition={{ delay: catIndex * 0.1 }}
              >
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                  {category.title}
                  <div className="h-px bg-slate-200 grow ml-4"></div>
                </h2>
              </motion.div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {category.tools.length > 0 ? (
                  category.tools.map((tool, index) => (
                    <Link key={tool.name} href={tool.href} className="block h-full">
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.05 }}
                        className={`h-full p-6 pb-20 rounded-2xl border border-slate-100 shadow-sm transition-all duration-300 hover:shadow-md hover:scale-[1.02] ${tool.color} group relative overflow-hidden`}
                      >
                        <div className="relative z-10 space-y-4">
                          <div className="bg-white w-fit p-3 rounded-xl shadow-sm border border-slate-100">
                            {tool.icon}
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-slate-900">
                              {tool.name}
                            </h3>
                            <p className="text-slate-600 mt-2 text-sm leading-relaxed">
                              {tool.description}
                            </p>
                          </div>
                        </div>

                        {/* Decorative background element */}
                        <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-white/40 rounded-full blur-2xl group-hover:bg-white/60 transition-colors" />
                      </motion.div>
                    </Link>
                  ))
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }} 
                    className="col-span-1 p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 flex flex-col items-center justify-center text-center gap-3 h-48"
                  >
                    <div className="p-2 bg-slate-100 rounded-lg text-slate-400">
                        <Construction className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-slate-900 font-medium">Coming Soon</p>
                        <p className="text-slate-500 text-sm">More tools are being forged.</p>
                    </div>
                  </motion.div>
                )}
              </div>
            </section>
          ))}
        </div>
        
        <FloatingHomeButton />
      </div>
    </div>
  );
}
