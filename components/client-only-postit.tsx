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
            animate={{ x: 0, rotate: -3 }}
            whileHover={{ rotate: 0, x: -5, scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 120, damping: 14 }}
            className="pointer-events-auto relative bg-yellow-300 shadow-[0_4px_12px_rgba(0,0,0,0.15)] py-2 px-3 sm:py-3 sm:px-4 rounded-sm flex flex-col items-center gap-1 sm:gap-1.5 group cursor-help max-w-[120px] sm:max-w-[160px] border-t border-yellow-100/40"
            title="Seriously, there is zero backend. Your computer is doing all the work. Don't worry, it's organic! 🥦"
        >
            {/* Visual Tape Effect */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-8 bg-white/20 -rotate-2 backdrop-blur-[1px] shadow-sm border border-white/10" />
            
            <div className="flex items-center gap-1.5 sm:gap-2 text-yellow-950 z-10">
                <span className="text-xs sm:text-sm font-black tracking-tight leading-none">Look Ma,<br/>No Server!</span>
                <motion.div 
                    animate={{ y: [0, -4, 0] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                >
                    <Ghost className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-800" />
                </motion.div>
            </div>
            
            <p className="text-[10px] font-bold text-yellow-900/80 text-center leading-tight z-10 w-full">
                Your browser is the boss today. 🏗️
            </p>
        </motion.div>
    </div>
  );
}
