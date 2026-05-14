"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    goatcounter?: {
      count?: (vars?: { path?: string }) => void;
    };
  }
}

export default function GoatCounterRouteTracker() {
  const pathname = usePathname();
  const hasMounted = useRef(false);

  useEffect(() => {
    // Skip initial mount because GoatCounter's script already tracks the first page load.
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    const counter = window.goatcounter;
    if (typeof counter?.count !== "function") {
      return;
    }

    counter.count({ path: `${pathname}${window.location.search}` });
  }, [pathname]);

  return null;
}
