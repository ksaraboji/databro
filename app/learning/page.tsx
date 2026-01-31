"use client";

import React from "react";
import { motion } from "framer-motion";
import { ExternalLink, Award, BookOpen, ChevronLeft } from "lucide-react"; // Icons
import Link from "next/link";
import { cn } from "@/lib/utils";
import FloatingHomeButton from "@/components/floating-home-button";

// Types for our data
interface ProfileLink {
  name: "DataCamp" | "O'Reilly";
  url: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

interface Certification {
  title: string;
  issuer: string;
  issueDate: string;
  badgeImageUrl: string; // URL to the badge image from Credly
  credlyUrl: string; // Link to the verification page
}

// --- PLACEHOLDER DATA ---
// TODO: Replace these with your actual profile URLs
const PROFILES: ProfileLink[] = [
  {
    name: "DataCamp",
    url: "https://www.datacamp.com/portfolio/sarakuma",
    description: "Check out my completed courses, XP, and streaks on DataCamp.",
    icon: BookOpen,
    color: "bg-green-100 text-green-700",
  },
  {
    name: "O'Reilly",
    url: "https://learning.oreilly.com/profile/", 
    description: "Explore my reading lists and learning history on O'Reilly.",
    icon: BookOpen,
    color: "bg-red-100 text-red-700",
  },
];

// TODO: Replace with your actual Credly badge data
const CERTIFICATIONS: Certification[] = [
  {
    title: "Example Certification Name",
    issuer: "AWS / Azure / GCP",
    issueDate: "Jan 2024",
    badgeImageUrl: "https://via.placeholder.com/150", 
    credlyUrl: "https://www.credly.com/earner/earned",
  },
  {
    title: "Another Certification",
    issuer: "DataBricks",
    issueDate: "Dec 2023",
    badgeImageUrl: "https://via.placeholder.com/150",
    credlyUrl: "https://www.credly.com/",
  },
];

export default function LearningPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
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
          className="text-center mb-16"
        >
          <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl mb-4">
            Continuous <span className="text-indigo-600">Learning</span>
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Keeping up with the ever-evolving landscape of Data Engineering and AI.
            Here are my certifications and active learning profiles.
          </p>
        </motion.div>

        {/* Profiles Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-20"
        >
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center">
            <BookOpen className="w-6 h-6 mr-2 text-indigo-600" />
            Learning Platforms
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PROFILES.map((profile) => (
              <a
                key={profile.name}
                href={profile.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative flex items-start p-6 bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-200 transition-all duration-300"
              >
                <div
                  className={cn(
                    "p-3 rounded-lg mr-4 shrink-0 transition-colors",
                    profile.color
                  )}
                >
                  <profile.icon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {profile.name}
                  </h3>
                  <p className="text-slate-500 mt-1 text-sm leading-relaxed">
                    {profile.description}
                  </p>
                  <span className="inline-flex items-center mt-3 text-sm font-medium text-indigo-600 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                    View Profile <ExternalLink className="w-3 h-3 ml-1" />
                  </span>
                </div>
              </a>
            ))}
          </div>
        </motion.section>

        {/* Certifications Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center">
            <Award className="w-6 h-6 mr-2 text-indigo-600" />
            Certifications & Badges
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {CERTIFICATIONS.map((cert, index) => (
              <div
                key={index}
                className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col items-center text-center shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Badge Image Area */}
                <div className="w-32 h-32 mb-4 relative flex items-center justify-center bg-slate-50 rounded-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cert.badgeImageUrl}
                    alt={cert.title}
                    className="w-full h-full object-contain p-2"
                  />
                </div>
                
                <h3 className="font-semibold text-slate-900 mb-1 line-clamp-2" title={cert.title}>
                  {cert.title}
                </h3>
                <p className="text-xs text-slate-500 mb-4">{cert.issuer} • {cert.issueDate}</p>
                
                <a
                  href={cert.credlyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto inline-flex items-center text-xs font-semibold uppercase tracking-wider text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-300 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors"
                >
                  Verify
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </div>
            ))}
          </div>
          
          {/* Instruction for Credly Embeds (Hidden in production, useful for dev) */}
          <div className="mt-8 p-4 bg-indigo-50 rounded-lg text-sm text-indigo-800 border border-indigo-100">
            <p className="font-semibold mb-1">💡 Developer Note:</p>
            <p>
              Credly provides an embedding feature. If you prefer dynamic badges, 
              you can replace the static images above with Credly&apos;s embed code snippet. 
              Go to your Credly dashboard &rarr; Select Badge &rarr; Share &rarr; Embed.
            </p>
          </div>
        </motion.section>
        
        <FloatingHomeButton />
      </div>
    </div>
  );
}
