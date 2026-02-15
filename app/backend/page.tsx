"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, MessageSquare, Mic, Database } from "lucide-react";
import { motion } from "framer-motion";
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
    title: "AI Services",
    features: [
      {
        name: "Document Summarizer",
        description: "Upload lengthy PDFs or Word documents and get concise summaries powered by LLMs.",
        icon: <BookOpen className="w-8 h-8 text-blue-600" />,
        href: "/backend/document-summarizer",
        color: "bg-blue-50 hover:bg-blue-100",
      },
      {
        name: "Learning Assistant",
        description: "Interactive AI tutor that creates lesson plans and teaches data engineering concepts.",
        icon: <MessageSquare className="w-8 h-8 text-indigo-600" />,
        href: "/learning",
        color: "bg-indigo-50 hover:bg-indigo-100",
      },
      {
        name: "Speech Services",
        description: "Convert text to speech and transcribe audio using Azure AI Speech.",
        icon: <Mic className="w-8 h-8 text-purple-600" />,
        href: "/backend/speech-converter", // Assuming this will be built or exists
        color: "bg-purple-50 hover:bg-purple-100",
      }
    ],
  },
  {
    id: "data-services",
    title: "Data Services",
    features: [
      {
        name: "RAG Knowledge Base",
        description: "Query a Retrieval-Augmented Generation system built on your documents.",
        icon: <Database className="w-8 h-8 text-emerald-600" />,
        href: "/backend/rag-explorer", // Placeholder
        color: "bg-emerald-50 hover:bg-emerald-100",
      },
    ]
  }
];

export default function BackendFeaturesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6 md:p-12 relative overflow-hidden font-sans">
      
      {/* Background Decorations */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000" />

      <FloatingHomeButton />

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="mb-4">
            <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Home
            </Link>
        </div>
        <header className="mb-12 text-center">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-4"
          >
            Backend Capabilities
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-slate-600 max-w-2xl mx-auto"
          >
            Explore the powerful backend services powering this portfolio, from LLM integration to data processing pipelines.
          </motion.p>
        </header>

        <div className="space-y-12">
          {backendFeatures.map((category, catIndex) => (
            <motion.section 
              key={category.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: catIndex * 0.1 + 0.2 }}
            >
              <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center">
                <span className="w-2 h-8 bg-indigo-500 rounded-full mr-3"></span>
                {category.title}
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {category.features.map((feature, index) => (
                  <Link key={feature.name} href={feature.href} className="group">
                    <motion.div
                      whileHover={{ y: -5, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}
                      className={`h-full p-6 rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-300 relative overflow-hidden`}
                    >
                      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-20 transition-transform group-hover:scale-150 duration-500 ${feature.color}`} />
                      
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${feature.color} transition-colors duration-300`}>
                        {feature.icon}
                      </div>
                      
                      <h3 className="text-xl font-bold text-slate-800 mb-2 group-hover:text-indigo-600 transition-colors">
                        {feature.name}
                      </h3>
                      
                      <p className="text-slate-600 text-sm leading-relaxed">
                        {feature.description}
                      </p>
                    </motion.div>
                  </Link>
                ))}
              </div>
            </motion.section>
          ))}
        </div>
      </div>
    </div>
  );
}
