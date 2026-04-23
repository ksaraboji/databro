"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Zap,
  Copy,
  Check,
  Home,
  AlertTriangle,
  Loader,
  Volume2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Tone = "professional" | "commanding" | "casual" | "friendly" | "slack";
type HeadlineMode = "none" | "email" | "slack";
type ModelOptionId =
  | "Qwen3-0.6B-q4f16_1-MLC"
  | "Llama-3.2-1B-Instruct-q4f16_1-MLC"
  | "gemma-3-1b-it-q4f16_1-MLC"
  | "phi-1_5-q4f16_1-MLC";

type ModelOption = {
  id: ModelOptionId;
  label: string;
  description: string;
};

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "Qwen3-0.6B-q4f16_1-MLC",
    label: "Qwen3 0.6B",
    description: "Lightweight and fast local model for browser inference.",
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 1B",
    description: "Small and fast local model for quick refinement.",
  },
  {
    id: "gemma-3-1b-it-q4f16_1-MLC",
    label: "Gemma 3 1B",
    description: "Compact Gemma 3 model optimized for local browser inference.",
  },
  {
    id: "phi-1_5-q4f16_1-MLC",
    label: "Phi-1.5",
    description: "High-quality compact model (higher VRAM requirement in browser).",
  },
];

interface WorkerMessage {
  type: "progress" | "ready" | "complete" | "error" | "update";
  payload?:
    | string
    | {
        progress?: number;
        text?: string;
        modelId?: ModelOptionId;
      };
}

export default function TextRefinerPage() {
  const [inputText, setInputText] = useState("");
  const [refinedText, setRefinedText] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<ModelOptionId | "">("");
  const [tone, setTone] = useState<Tone>("professional");
  const [headlineMode, setHeadlineMode] = useState<HeadlineMode>("none");
  const [addBullets, setAddBullets] = useState(false);
  const [addEmojis, setAddEmojis] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const workerRef = useRef<Worker | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRefinePayloadRef = useRef({
    text: "",
    tone: "professional" as Tone,
    headlineMode: "none" as HeadlineMode,
    addBullets: false,
    addEmojis: false,
  });

  const selectedModel = MODEL_OPTIONS.find((option) => option.id === selectedModelId);

  const clearErrorTimer = useCallback(() => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
  }, []);

  const disposeWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  useEffect(() => {
    latestRefinePayloadRef.current = {
      text: inputText,
      tone,
      headlineMode,
      addBullets,
      addEmojis,
    };
  }, [inputText, tone, headlineMode, addBullets, addEmojis]);

  const requestRefinement = useCallback((options?: { silentIfEmpty?: boolean }) => {
    const { text, tone, headlineMode, addBullets, addEmojis } = latestRefinePayloadRef.current;

    if (!text.trim()) {
      if (!options?.silentIfEmpty) {
        setError("Please enter some text to refine");
      }
      return;
    }

    if (!workerRef.current) {
      setError("Worker not available");
      return;
    }

    setLoading(true);
    setError(null);
    setRefinedText("");

    workerRef.current.postMessage({
      type: "refine",
      payload: {
        text,
        tone,
        headlineMode,
        addBullets,
        addEmojis,
      },
    });
  }, []);

  const createWorker = useCallback((modelId: ModelOptionId) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });

    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const { type, payload } = e.data;

      if (type === "progress") {
        setProgress(typeof payload === "object" ? payload.progress ?? 0 : 0);
        setProgressText(typeof payload === "object" ? payload.text ?? "" : "");
      } else if (type === "ready") {
        setModelReady(true);
        setModelLoading(false);

        if (latestRefinePayloadRef.current.text.trim()) {
          requestRefinement({ silentIfEmpty: true });
        }
      } else if (type === "update") {
        setRefinedText(typeof payload === "string" ? payload : "");
      } else if (type === "complete") {
        setRefinedText(typeof payload === "string" ? payload : "");
        setLoading(false);
      } else if (type === "error") {
        setError(typeof payload === "string" ? payload : "Unknown error occurred");
        setLoading(false);
        setModelLoading(false);
        clearErrorTimer();
        errorTimeoutRef.current = setTimeout(() => setError(null), 5000);
      }
    };

    worker.onerror = (err) => {
      setError(err.message || "Worker error occurred");
      setLoading(false);
      setModelLoading(false);
    };

    worker.postMessage({ type: "init", payload: { modelId } });
  }, [clearErrorTimer, requestRefinement]);

  useEffect(() => {
    return () => {
      clearErrorTimer();
      disposeWorker();
    };
  }, [clearErrorTimer, disposeWorker]);

  useEffect(() => {
    let cancelled = false;

    const loadSelectedModel = async () => {
      disposeWorker();
      clearErrorTimer();
      setError(null);
      setLoading(false);
      setRefinedText("");
      setModelReady(false);
      setProgress(0);
      setProgressText("");

      if (!selectedModelId) {
        setModelLoading(false);
        return;
      }

      setModelLoading(true);

      if ("caches" in globalThis) {
        await Promise.all([
          globalThis.caches.delete("webllm/config"),
          globalThis.caches.delete("webllm/wasm"),
          globalThis.caches.delete("webllm/model"),
        ]);
      }

      if (!cancelled) {
        createWorker(selectedModelId);
      }
    };

    void loadSelectedModel();

    return () => {
      cancelled = true;
    };
  }, [selectedModelId, clearErrorTimer, createWorker, disposeWorker]);

  // Auto-refine when input, tone, or formatting options change
  useEffect(() => {
    if (!modelReady) {
      return;
    }

    if (!inputText.trim()) {
      return;
    }

    const timeoutId = setTimeout(() => {
      requestRefinement({ silentIfEmpty: true });
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [inputText, tone, headlineMode, addBullets, addEmojis, modelReady, requestRefinement]);

  const handleCopy = () => {
    if (refinedText) {
      navigator.clipboard.writeText(refinedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toneDescriptions: Record<Tone, string> = {
    professional: "Formal, clear, suitable for emails and business docs",
    commanding: "Authoritative, direct, and impactful",
    casual: "Relaxed, conversational, friendly",
    friendly: "Warm, personal, and engaging",
    slack: "Concise, conversational, perfect for chat messages",
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100 font-sans p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6 py-12">
        {/* Header */}
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <Link
              href="/tools"
              className="p-2 rounded-full hover:bg-white transition-colors text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2 text-left"
            >
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                <Zap className="w-8 h-8 text-amber-600" />
                Text Refiner
              </h1>
              <p className="text-sm text-slate-600">
                Refine text by tone, fix spelling/grammar, and add formatting.
              </p>
            </motion.div>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-amber-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-white"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </header>

        {/* Model Loading Status */}
        <AnimatePresence>
          {modelLoading && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-4"
            >
              <Loader className="w-5 h-5 text-blue-600 animate-spin" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-900">
                  {progressText || `Loading ${selectedModel?.label || "selected model"}...`}
                </p>
                <div className="w-full bg-blue-200 rounded-full h-2 mt-2 overflow-hidden">
                  <motion.div
                    className="bg-blue-600 h-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-xs text-blue-700 mt-1">{progress}%</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <div className="space-y-8">
          {/* Tone and Effects - Compact Controls */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4"
          >
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wide mr-1">
                  Model
                </span>
                <select
                  suppressHydrationWarning
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value as ModelOptionId | "")}
                  className="min-w-52 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-amber-300 focus:bg-white"
                >
                  <option value="">Select a model</option>
                  {MODEL_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {selectedModel ? (
                  <span className="text-xs text-slate-500">
                    {selectedModel.description}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wide mr-1">
                  Tone
                </span>
                {(Object.keys(toneDescriptions) as Array<Tone>).map((t) => (
                  <label
                    key={t}
                    title={toneDescriptions[t]}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold capitalize cursor-pointer transition-colors ${
                      tone === t
                        ? "border-amber-300 bg-amber-50 text-amber-900"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="radio"
                      name="tone"
                      value={t}
                      checked={tone === t}
                      onChange={() => setTone(t)}
                      className="w-3.5 h-3.5 accent-amber-600"
                      disabled={!modelReady}
                    />
                    {t}
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wide mr-1">
                  Headline
                </span>
                {([
                  ["none", "None", "Return only the refined body text"],
                  ["email", "Email", "Include an email-style subject line in the response"],
                  ["slack", "Slack", "Include a short Slack-style headline in the response"],
                ] as const).map(([value, label, description]) => (
                  <label
                    key={value}
                    title={description}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                      headlineMode === value
                        ? "border-amber-300 bg-amber-50 text-amber-900"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="radio"
                      name="headline"
                      value={value}
                      checked={headlineMode === value}
                      onChange={() => setHeadlineMode(value)}
                      className="w-3.5 h-3.5 accent-amber-600"
                      disabled={!modelReady}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wide mr-1">
                  Effects
                </span>
                <label
                  title="Format with bullet points"
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                    addBullets
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={addBullets}
                    onChange={(e) => setAddBullets(e.target.checked)}
                    className="w-3.5 h-3.5 accent-amber-600 rounded"
                    disabled={!modelReady}
                  />
                  Bullets
                </label>
                <label
                  title="Include relevant emojis"
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                    addEmojis
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={addEmojis}
                    onChange={(e) => setAddEmojis(e.target.checked)}
                    className="w-3.5 h-3.5 accent-amber-600 rounded"
                    disabled={!modelReady}
                  />
                  Emojis
                </label>
              </div>
            </div>
          </motion.div>

          {/* Input and Output Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Input Text Area */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4 h-full flex flex-col"
            >
              <label className="block text-sm font-bold text-slate-900 uppercase tracking-wide">
                Original Text
              </label>
              <textarea
                value={inputText}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setInputText(nextValue);

                  if (!nextValue.trim()) {
                    setRefinedText("");
                    setLoading(false);
                    setError(null);
                  }
                }}
                placeholder="Paste your text here... I'll fix spelling, grammar, and adjust the tone."
                className="w-full p-4 font-mono text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 focus:outline-none transition-all resize-none text-slate-700"
                style={{ height: "56vh", minHeight: "420px" }}
              />

              {/* Privacy Badge */}
              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex items-center justify-center gap-2 text-xs font-medium text-emerald-800">
                <Volume2 className="w-3 h-3" />
                Running locally in browser. No server calls.
              </div>
            </motion.div>

            {/* Output Text Area */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4 h-full flex flex-col"
            >
              <div className="flex items-center justify-between">
                <label className="block text-sm font-bold text-slate-900 uppercase tracking-wide">
                  Refined Text
                </label>
                {loading ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800">
                    <Loader className="w-3.5 h-3.5 animate-spin" />
                    Generating...
                  </div>
                ) : refinedText ? (
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-xs font-medium text-slate-700 transition-all"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy
                      </>
                    )}
                  </button>
                ) : null}
              </div>
              <div
                className="w-full p-4 font-mono text-sm bg-slate-50 border border-slate-200 rounded-xl overflow-y-auto text-slate-700 whitespace-pre-wrap"
                style={{ height: "56vh", minHeight: "420px" }}
              >
                {refinedText || (
                  <span className={`italic ${loading ? "text-amber-700 animate-pulse" : "text-slate-400"}`}>
                    {loading ? "Generating refined text..." : "Output will appear here"}
                  </span>
                )}
              </div>
            </motion.div>
          </div>

          {/* Refine Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => requestRefinement()}
              disabled={!modelReady || loading || !inputText.trim()}
              className="w-full bg-linear-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:from-slate-300 disabled:to-slate-300 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Refining...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Refine Text
                </>
              )}
            </motion.button>
          </motion.div>
        </div>

      <p className="text-center text-slate-400 text-xs mt-8">
        Powered by {selectedModel?.label || "your selected local model"} running locally in your browser.
      </p>
    </div>
    </div>
  );
}

