'use client';

import { motion } from 'framer-motion';
import { Ghost } from 'lucide-react';
import { usePathname } from 'next/navigation';

export default function ClientOnlyPostit() {
  const pathname = usePathname();
  
  // Hide on backend and visualization pages
  if (pathname?.startsWith('/backend') || pathname?.startsWith('/visualizations')) {
    return null;
  }

  return (
    <div className="fixed top-24 right-0 z-40 flex justify-end pointer-events-none overflow-visible p-2 sm:p-4 sm:top-32 hidden sm:flex">
        <motion.div 
            initial={{ x: "120%", rotate: 10 }}
            animate={{ x: 0, rotate: -2 }}
            whileHover={{ rotate: 0, x: -5, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 100, damping: 15 }}
            className="pointer-events-auto relative bg-[#FEF9C3] shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05),2px_2px_0px_rgba(217,119,6,0.2)] py-4 px-5 rounded-sm flex flex-col items-center gap-2 group cursor-help max-w-45 border border-yellow-200"
            title="Seriously, there is zero backend. Your computer is doing all the work. Don't worry, it's organic! 🥦"
            style={{
                backgroundImage: 'linear-gradient(to bottom right, #FEF9C3, #FEF08A)',
            }}
        >
            {/* Visual Tape Effect - More realistic transparency and placement */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-10 bg-white/30 -rotate-1 backdrop-blur-[2px] shadow-sm border-t border-b border-white/20 mix-blend-overlay" />
            
            <div className="flex items-start gap-3 w-full border-b border-yellow-900/10 pb-2 mb-1">
                <span className="text-sm font-black tracking-tight text-yellow-950 leading-tight">
                    Look Ma,<br/>No Server!
                </span>
                <motion.div 
                    animate={{ y: [0, -3, 0], rotate: [0, 5, 0] }}
                    transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                    className="mt-0.5"
                >
                    <Ghost className="w-5 h-5 text-amber-900" strokeWidth={2.5} />
                </motion.div>
            </div>
            
            <p className="text-[11px] font-medium text-yellow-900/90 text-left leading-relaxed w-full">
                Your browser is the boss today. <span className="font-bold text-amber-800">100% Client-Side.</span> 🏗️
            </p>

            {/* Subtle curled corner effect using a cleaner gradient/shadow approach */}
            <div className="absolute bottom-0 right-0 w-4 h-4 bg-linear-to-tl from-yellow-600/20 to-transparent rounded-tl-lg pointer-events-none" />
        </motion.div>
    </div>
  );
}
