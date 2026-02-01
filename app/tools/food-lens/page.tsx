"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, Upload, ScanLine, Utensils, AlertCircle, RefreshCw, Smartphone, Image as ImageIcon, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Types
type Prediction = {
  label: string;
  score: number;
};

type AnalysisStatus = 'idle' | 'loading_model' | 'analyzing' | 'complete' | 'error';

export default function FoodLensPage() {
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [progress, setProgress] = useState<number>(0); // 0-100
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [errorDetails, setErrorDetails] = useState<string>("");
  
  const workerRef = useRef<Worker | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Worker
  useEffect(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('./worker.ts', import.meta.url), {
        type: 'module'
      });

      workerRef.current.onmessage = (event) => {
        const { status, file, progress, result, error } = event.data;

        if (status === 'progress') {
           setStatus('loading_model');
           if (file === 'dino-v2' || file === 'config.json' || !file) {
               // Approximate progress logic if needed, or just use what's given
           }
           if (typeof progress === 'number') {
               setProgress(progress);
           }
        } else if (status === 'complete') {
            setPredictions(result);
            setStatus('complete');
        } else if (status === 'error') {
            setStatus('error');
            setErrorDetails(error);
        }
      };
    }

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const analyzeImage = (imageUrl: string) => {
    if (!workerRef.current) return;
    setStatus('analyzing');
    setPredictions([]);
    workerRef.current.postMessage({ image: imageUrl });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setImage(result);
        analyzeImage(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
      setImage(null);
      setStatus('idle');
      setPredictions([]);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-12">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/tools" className="p-2 -ml-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
                <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-bold text-slate-800 flex items-center gap-2">
                <Utensils className="w-5 h-5 text-orange-500" />
                Food Lens
            </h1>
            <div className="w-9"></div> {/* Spacer for centering */}
          </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        
        {/* Intro Card */}
        {!image && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center space-y-6"
          >
             <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
                 <ScanLine className="w-10 h-10 text-orange-500" />
             </div>
             <div>
                 <h2 className="text-xl font-bold text-slate-900 mb-2">Identify Food Instantly</h2>
                 <p className="text-slate-500">
                     Take a picture of your meal and let our on-device AI tell you what it sees.
                     Privacy first: images never leave your device.
                 </p>
             </div>

             <div className="grid grid-cols-2 gap-4 pt-4">
                 <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed border-slate-200 hover:border-orange-400 hover:bg-orange-50 transition-all group"
                 >
                     <Upload className="w-8 h-8 text-slate-400 group-hover:text-orange-500" />
                     <span className="font-semibold text-slate-600 group-hover:text-orange-600">Upload Photo</span>
                 </button>
                 <button 
                     onClick={() => fileInputRef.current?.click()} // On mobile, file input accepts camera if capture attr set
                     className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all group"
                 >
                     <Camera className="w-8 h-8 text-slate-400 group-hover:text-indigo-500" />
                     <span className="font-semibold text-slate-600 group-hover:text-indigo-600">Take Photo</span>
                 </button>
             </div>
             
             {/* Hidden Input supports camera on mobile */}
             <input 
                ref={fileInputRef}
                type="file" 
                accept="image/*"
                capture="environment" 
                className="hidden"
                onChange={handleFileSelect}
             />
          </motion.div>
        )}

        {/* Analysis View */}
        <AnimatePresence>
            {image && (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="space-y-6"
                >
                    {/* Image Container */}
                    <div className="relative rounded-3xl overflow-hidden shadow-lg bg-black aspect-square sm:aspect-video group">
                         <img src={image} alt="Captured food" className="w-full h-full object-cover opacity-90" />
                         
                         <button 
                            onClick={clearImage}
                            className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 backdrop-blur-sm transition-colors"
                         >
                            <X className="w-5 h-5" />
                         </button>

                         {/* Scan Animation Overlay */}
                         {(status === 'analyzing' || status === 'loading_model') && (
                             <div className="absolute inset-0 bg-black/20 z-10">
                                 <motion.div 
                                    className="h-1 bg-white/80 shadow-[0_0_15px_rgba(255,255,255,0.8)] w-full absolute top-0"
                                    animate={{ top: ["0%", "100%", "0%"] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                 />
                                 <div className="absolute inset-0 flex items-center justify-center">
                                     <div className="bg-black/60 backdrop-blur-md px-6 py-3 rounded-full text-white font-medium flex items-center gap-3">
                                         <RefreshCw className="w-5 h-5 animate-spin" />
                                         {status === 'loading_model' ? `Loading AI Model (${Math.round(progress)}%)` : 'Analyzing...'}
                                     </div>
                                 </div>
                             </div>
                         )}
                    </div>

                    {/* Results Container */}
                    {status === 'complete' && (
                        <motion.div 
                           initial={{ opacity: 0, y: 20 }}
                           animate={{ opacity: 1, y: 0 }}
                           className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"
                        >
                            <div className="p-4 bg-slate-50 border-b border-slate-100 font-medium text-slate-500 text-sm uppercase tracking-wider">
                                Predictions
                            </div>
                            <div className="divide-y divide-slate-100">
                                {predictions.slice(0, 3).map((pred, idx) => (
                                    <div key={idx} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                                        <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm
                                            ${idx === 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}
                                        `}>
                                            {(pred.score * 100).toFixed(0)}%
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-bold text-slate-800 capitalize text-lg">
                                                {pred.label.replace(/_/g, " ")}
                                            </div>
                                            <div className="h-2 w-full bg-slate-100 rounded-full mt-2 overflow-hidden">
                                                <motion.div 
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${pred.score * 100}%` }}
                                                    transition={{ delay: idx * 0.1, duration: 0.5 }}
                                                    className={`h-full rounded-full ${idx === 0 ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {status === 'error' && (
                        <div className="bg-red-50 text-red-800 p-4 rounded-xl flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold">Analysis Failed</p>
                                <p className="text-sm opacity-80">{errorDetails || "Something went wrong processing the image."}</p>
                            </div>
                        </div>
                    )}

                    <div className="text-center text-xs text-slate-400 px-4">
                        Powered by <span className="font-mono">vit-base-patch16-224</span> via WebAssembly. <br/>
                        Running completely offline in your browser.
                    </div>

                </motion.div>
            )}
        </AnimatePresence>

      </div>
    </div>
  );
}
