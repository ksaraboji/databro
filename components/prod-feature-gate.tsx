"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

type ProdFeatureGateProps = {
  featureName: string;
  children: React.ReactNode;
};

const PROD_HOSTS = new Set([
  "databro.dev",
  "www.databro.dev",
  "data-bro.com",
  "www.data-bro.com",
]);

const DEV_HOSTS = new Set([
  "dev.databro.dev",
  "dev.data-bro.com",
]);

export default function ProdFeatureGate({ featureName, children }: ProdFeatureGateProps) {
  const [blocked, setBlocked] = useState(false);

  const gateEnabled = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_HIDE_DEV_FEATURES_ON_PROD;
    if (!raw) return true;
    return raw.toLowerCase() === "true";
  }, []);

  useEffect(() => {
    if (!gateEnabled) {
      setBlocked(false);
      return;
    }

    const host = window.location.hostname.toLowerCase();
    const isDevHost = DEV_HOSTS.has(host);
    const isProdHost = PROD_HOSTS.has(host);
    setBlocked(isProdHost && !isDevHost);
  }, [gateEnabled]);

  if (!blocked) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8 flex flex-col items-center justify-center text-center relative font-sans">
      <Link href="/" className="absolute top-6 left-6 sm:top-8 sm:left-8">
        <button className="p-3 rounded-full bg-white shadow-sm border border-slate-200 hover:bg-slate-50 transition-all hover:scale-105 active:scale-95 group">
          <ArrowLeft className="w-5 h-5 text-slate-600 group-hover:text-slate-900" />
        </button>
      </Link>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", duration: 0.6 }}
        className="space-y-6 max-w-lg bg-white p-8 sm:p-12 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100"
      >
        <motion.div
          animate={{ scale: [1, 1.08, 1], rotate: [0, 4, -4, 0] }}
          transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
          className="mx-auto w-20 h-20 bg-amber-50 rounded-2xl flex items-center justify-center border border-amber-100"
        >
          <AlertTriangle className="w-10 h-10 text-amber-600" />
        </motion.div>

        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">{featureName}</h1>
          <div className="inline-block px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold uppercase tracking-wider rounded-full">
            Under Active Development
          </div>
        </div>

        <p className="text-slate-600 text-lg leading-relaxed">
          This corner of the site is still in the workshop. The duct tape is visible, the wiring is questionable,
          and future me asked that we do not let visitors in just yet.
        </p>

        <div className="pt-4">
          <Link href="/" className="text-indigo-600 font-semibold hover:text-indigo-700 hover:underline">
            Return Home &rarr;
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
