'use client';

import Link from 'next/link';
import { Home, ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function FloatingHomeButton() {
  const [isVisible, setIsVisible] = useState(false);

  // Show button only after scrolling down a bit
  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed bottom-6 left-6 z-40 flex flex-col gap-3">
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
             <button 
                onClick={scrollToTop}
                className="p-3 bg-white/80 backdrop-blur border border-slate-200 text-slate-500 rounded-full shadow-lg hover:bg-white hover:text-indigo-600 hover:scale-110 active:scale-95 transition-all text-xs font-semibold flex items-center justify-center group"
                title="Scroll to Top"
             >
                <ArrowUp className="w-5 h-5" />
             </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.05 }}
          >
            <Link href="/">
              <button 
                className="p-3 bg-indigo-600 border border-indigo-700 text-white rounded-full shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:scale-110 active:scale-95 transition-all flex items-center justify-center group"
                title="Back to Home"
              >
                <Home className="w-5 h-5" />
              </button>
            </Link>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
