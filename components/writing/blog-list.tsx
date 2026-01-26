"use client";

import React from "react";
import { motion } from "framer-motion";
import { ExternalLink, Hash, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Navigation */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Home
          </Link>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl mb-4">
            Technical <span className="text-indigo-600">Writing</span>
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl">
            Thoughts on data engineering, system architecture, and code. 
            A collection of my latest articles from Medium.
          </p>
        </motion.div>

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
      </div>
    </div>
  );
}
