"use client";

import Link from "next/link";
import { ArrowLeft, Table2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import FloatingHomeButton from "@/components/floating-home-button";

type Feature = {
  name: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  color: string;
};

type Category = {
  id: string;
  title: string;
  features: Feature[];
};

const backendFeatures: Category[] = [
  {
    id: "ai-services",
    title: "AI & LLM Services",
    features: [
      {
        name: "AI Data Chat",
        description: "Upload CSV, Excel, Parquet, JSON, or Arrow files and chat with an AI analyst about the data.",
        icon: <Table2 className="w-8 h-8 text-indigo-600" />,
        href: "/backend/ai-data-chat",
        color: "bg-indigo-50 hover:bg-indigo-100",
      },
    ],
  },
];

export default function BackendPage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-indigo-50/50 p-4 sm:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-12 py-12">
        {/* Header */}
        <header className="space-y-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-slate-950">
              Burning My Credits
            </h1>
            <p className="text-lg md:text-xl text-slate-600 max-w-2xl leading-relaxed">
              Heavy-duty microservices running across the multi-cloud verse. 
              Please be gentle, my personal credit card is on the line.
            </p>
          </motion.div>
        </header>

        {/* Categories Grid */}
        <div className="space-y-16">
          {backendFeatures.map((category, catIndex) => (
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
                {category.features.map((feature, index) => (
                  <Link key={feature.name} href={feature.href} className="block h-full">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.05 }}
                      className={cn(
                        "h-full p-6 pb-20 rounded-2xl border border-slate-100 shadow-sm transition-all duration-300 hover:shadow-md hover:scale-[1.02] group relative overflow-hidden",
                        feature.color
                      )}
                    >
                      <div className="relative z-10 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="bg-white w-fit p-3 rounded-xl shadow-sm border border-slate-100">
                            {feature.icon}
                          </div>
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-800">
                            Agentic
                          </span>
                        </div>

                        <div>
                          <h3 className="text-xl font-bold text-slate-900">
                            {feature.name}
                          </h3>
                          <p className="text-slate-600 mt-2 text-sm leading-relaxed">
                            {feature.description}
                          </p>
                        </div>
                      </div>

                      <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-white/40 rounded-full blur-2xl group-hover:bg-white/60 transition-colors" />
                    </motion.div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
        
        <FloatingHomeButton />
      </div>
    </div>
  );
}


