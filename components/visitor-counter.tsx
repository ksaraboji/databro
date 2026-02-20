"use client";

import { useEffect, useState } from "react";

export default function VisitorCounter() {
  const [hasCounted, setHasCounted] = useState(false);

  useEffect(() => {
    // Prevent double counting in React Strict Mode or re-renders
    if (hasCounted) return;

    async function fetchVisitorCount() {
      try {
        // Use timezone as a proxy for location (e.g., "America/New_York")
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const locationPool = timeZone.split('/')[0]; // simple grouping by continent/region
        
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_GATEWAY_URL || "https://api-gateway.victorioushill-531514fe.eastus.azurecontainerapps.io"}/visitor-count?location=${encodeURIComponent(locationPool)}`);
        
        if (response.ok) {
           setHasCounted(true);
        }
      } catch (error) {
        console.error("Failed to update visitor count", error);
      }
    }

    // Only run if not already counted this session (optional optimization, but good for "visits")
    // For now, let's just run it once per mount
    const hasVisited = sessionStorage.getItem("hasVisited");
    if (!hasVisited) {
        fetchVisitorCount();
        sessionStorage.setItem("hasVisited", "true");
    }
  }, [hasCounted]);

  // Hidden component, logic only
  return null;
}
