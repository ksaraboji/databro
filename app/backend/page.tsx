"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, Bot, Construction } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import FloatingHomeButton from "@/components/floating-home-button";

type Feature = {
  name: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  color: string;
  status: "live" | "building" | "planned";
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
        name: "Document Summarizer",
        description: "Analyze lengthy PDFs or Word docs with LLM-powered summarization.",
        icon: <BookOpen className="w-8 h-8 text-indigo-600" />,
        href: "/backend/document-summarizer",
        color: "bg-indigo-50 hover:bg-indigo-100",
        status: "live",
      },
    ],
  },
];

export default function BackendPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 p-4 sm:p-8 font-sans">
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
                {category.features.length > 0 ? (
                  category.features.map((feature, index) => (
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
                          <div className="flex justify-between items-start">
                             <div className="bg-white w-fit p-3 rounded-xl shadow-sm border border-slate-100">
                               {feature.icon}
                             </div>
                             <StatusBadge status={feature.status} />
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
                        <p className="text-slate-500 text-sm">More services are being deployed.</p>
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

function StatusBadge({ status }: { status: Feature["status"] }) {
  const styles = {
    live: "bg-emerald-100 text-emerald-700 border-emerald-200",
    building: "bg-amber-100 text-amber-700 border-amber-200",
    planned: "bg-slate-100 text-slate-500 border-slate-200 dashed border-dashed",
  };

  const labels = {
    live: "Live",
    building: "In Progress",
    planned: "Concept",
  };

  return (
    <span className={cn(
      "px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold border",
      styles[status]
    )}>
      {labels[status]}
    </span>
  );
}

