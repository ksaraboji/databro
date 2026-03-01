"use client";

import React from "react";
import { motion } from "framer-motion";
import { ExternalLink, Hash, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import FloatingHomeButton from "@/components/floating-home-button";

export type Platform = "Medium" | "Dev.to" | "Hashnode" | "Personal";

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  platform: Platform;
  url: string;
  date: string;
  readTime?: string;
  tags: string[];
}

const PlatformBadge = ({ platform }: { platform: Platform }) => {
  const colors = {
    "Medium": "bg-black text-white",
    "Dev.to": "bg-slate-900 text-slate-100",
    "Hashnode": "bg-blue-600 text-white",
    "Personal": "bg-indigo-600 text-white",
  };

  return (
    <span className={cn("text-xs font-bold px-2 py-1 rounded-md", colors[platform] || "bg-slate-200")}>
      {platform}
    </span>
  );
};

export default function BlogList({ posts }: { posts: BlogPost[] }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 p-4 md:p-8 lg:p-12 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <FloatingHomeButton />
      
      <div className="max-w-4xl mx-auto space-y-12 md:space-y-16 py-8">
        {/* Navigation */}
        <header className="space-y-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors group"
          >
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Home
          </Link>
          
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="space-y-4"
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-slate-950">
              Build Logs
            </h1>
            <p className="text-lg md:text-xl text-slate-600 max-w-2xl leading-relaxed">
              Field notes on building systems, debugging code, and architecture decisions.
              A collection of my latest articles from Medium and Dev.to.
            </p>
          </motion.div>
        </header>

        {/* Blog Post List */}
        <div className="space-y-6">
          {posts.map((post, index) => (
            <motion.a
              key={post.id}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group block bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 hover:border-indigo-200 shadow-sm hover:shadow-md transition-all duration-300"
            >
              <div className="flex flex-col sm:flex-row gap-4 justify-between sm:items-start mb-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <PlatformBadge platform={post.platform} />
                    <span className="text-sm text-slate-400 font-medium">
                      {post.date}
                    </span>
                    {/* Read time is not always available in RSS, so we make it optional */}
                    {post.readTime && (
                       <span className="text-sm text-slate-400 font-medium">
                         • {post.readTime}
                       </span>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {post.title}
                  </h2>
                </div>
                <div className="hidden sm:block">
                    <ExternalLink className="w-5 h-5 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                </div>
              </div>
              
              <p className="text-slate-600 leading-relaxed max-w-3xl mb-4 line-clamp-3">
                {post.excerpt}
              </p>

              <div className="flex flex-wrap gap-2 mt-2">
                {post.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded hover:bg-slate-200 transition-colors">
                    <Hash className="w-3 h-3 mr-0.5 opacity-50" />
                    {tag}
                  </span>
                ))}
              </div>
            </motion.a>
          ))}
        </div>
        
        {/* Footer Note */}
        <div className="mt-12 text-center">
            <a 
                href="https://medium.com/@sarakuma"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
                Read more on Medium <ExternalLink className="w-4 h-4 ml-1" />
            </a>
        </div>
        
        <FloatingHomeButton />
      </div>
    </div>
  );
}
