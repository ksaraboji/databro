"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, MessageSquare, Mic, Database, Server, Workflow, Bot, Code2, LineChart } from "lucide-react";
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
  icon: React.ReactNode;
  features: Feature[];
};

const backendFeatures: Category[] = [
  {
    id: "ai-services",
    title: "AI & LLM Services",
    icon: <Bot className="w-6 h-6 text-indigo-600" />,
    features: [
      {
        name: "Document Summarizer",
        description: "Analyze lengthy PDFs or Word docs with LLM-powered summarization.",
        icon: <BookOpen className="w-5 h-5 text-white" />,
        href: "/backend/document-summarizer",
        color: "bg-indigo-500",
        status: "live",
      },
    ],
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function BackendPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 p-4 md:p-8 lg:p-12 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <FloatingHomeButton />

      <div className="max-w-6xl mx-auto space-y-12 md:space-y-16 py-8">
        {/* Header */}
        <header className="space-y-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Home
          </Link>
          
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="space-y-4"
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
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-16"
        >
          {backendFeatures.map((category) => (
            <div key={category.id} className="space-y-8">
              <motion.div variants={item} className="flex items-center gap-3 border-b border-slate-200 pb-4">
                <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-100">
                    {category.icon}
                </div>
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                  {category.title}
                </h2>
              </motion.div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {category.features.map((feature) => (
                  <motion.div 
                    key={feature.name} 
                    variants={item}
                    className="h-full"
                  >
                    <Link href={feature.href} className="block h-full group">
                      <div className={cn(
                        "h-full p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden",
                        "bg-white border-slate-200 shadow-sm",
                        "hover:border-indigo-300 hover:shadow-lg hover:-translate-y-1",
                        "flex flex-col gap-4"
                      )}>
                        {/* Decorative background blob on hover */}
                        <div className="absolute -right-10 -top-10 w-32 h-32 bg-indigo-50/50 rounded-full blur-2xl group-hover:bg-indigo-100/50 transition-colors" />

                        <div className="flex items-start justify-between relative z-10">
                          <div className={cn("p-3 rounded-xl shadow-sm", feature.color)}>
                            {feature.icon}
                          </div>
                          <StatusBadge status={feature.status} />
                        </div>
                        
                        <div className="relative z-10 space-y-2">
                          <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {feature.name}
                          </h3>
                          <p className="text-slate-600 text-sm leading-relaxed">
                            {feature.description}
                          </p>
                        </div>

                        {/* Hover indicator */}
                        <div className="mt-auto pt-4 flex items-center text-sm font-medium text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 duration-300">
                          View details <ArrowLeft className="w-4 h-4 ml-1 rotate-180" />
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </motion.div>
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
