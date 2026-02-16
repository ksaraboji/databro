"use client";

import React, { useEffect, useState } from "react";
import { Eye } from "lucide-react";

export default function VisitorCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    async function fetchVisitorCount() {
      try {
        const response = await fetch("https://api-gateway.victorioushill-531514fe.eastus.azurecontainerapps.io/visitor-count");
        if (response.ok) {
          const data = await response.json();
          setCount(data.count);
        }
      } catch (error) {
        console.error("Failed to fetch visitor count", error);
        // Silently fail or keep null
      }
    }
    fetchVisitorCount();
  }, []);

  if (count === null) return null;

  return (
    <div className="fixed bottom-4 left-4 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-full px-4 py-2 shadow-sm text-xs font-medium text-slate-500 flex items-center gap-2">
      <Eye className="w-3 h-3 text-indigo-500" />
      <span>{count.toLocaleString()} visits</span>
    </div>
  );
}
