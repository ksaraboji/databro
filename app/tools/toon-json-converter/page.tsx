"use client";

import React, { useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, Download, FileJson, Home, Repeat2, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { encode, decode } from "@toon-format/toon";
import { cn } from "@/lib/utils";

type Mode = "json-to-toon" | "toon-to-json";

export default function ToonJsonConverterPage() {
  const [mode, setMode] = useState<Mode>("json-to-toon");
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { output, error } = useMemo(() => {
    if (!input.trim()) {
      return { output: "", error: "" };
    }

    try {
      if (mode === "json-to-toon") {
        const parsed = JSON.parse(input) as unknown;
        return { output: encode(parsed), error: "" };
      }

      const decoded = decode(input) as unknown;
      return { output: JSON.stringify(decoded, null, 2), error: "" };
    } catch (err) {
      if (err instanceof Error) {
        return { output: "", error: err.message };
      }
      return { output: "", error: "Invalid input." };
    }
  }, [input, mode]);

  const handleSwap = () => {
    setMode((prev) => (prev === "json-to-toon" ? "toon-to-json" : "json-to-toon"));
    setInput("");
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error("Copy failed", err);
    }
  };

  const handleDownload = () => {
    if (!output) return;
    const ext = mode === "json-to-toon" ? "toon" : "json";
    const mime = mode === "json-to-toon" ? "text/plain" : "application/json";
    const blob = new Blob([output], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `converted.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".toon")) setMode("toon-to-json");
      else if (lower.endsWith(".json")) setMode("json-to-toon");
      setInput(text);
      setCopied(false);
    } catch (err) {
      console.error("File upload failed", err);
    } finally {
      event.target.value = "";
    }
  };

  const loadSample = () => {
    if (mode === "json-to-toon") {
      setInput(
        JSON.stringify(
          {
            name: "Alice",
            age: 30,
            active: true,
            tags: ["dev", "aws"],
            address: { city: "Bengaluru", zip: "560001" },
          },
          null,
          2
        )
      );
    } else {
      setInput(
        `name: Alice\nage: 30\nactive: true\ntags[2]: dev,aws\naddress:\n  city: Bengaluru\n  zip: 560001`
      );
    }
  };

  const inputLabel = mode === "json-to-toon" ? "Input (JSON)" : "Input (TOON)";
  const outputLabel = mode === "json-to-toon" ? "Output (TOON)" : "Output (JSON)";
  const inputPlaceholder =
    mode === "json-to-toon"
      ? '{\n  "name": "Alice",\n  "age": 30\n}'
      : "name: Alice\nage: 30";

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-violet-50/50 p-4 font-sans sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-center justify-between border-b border-slate-200 pb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/tools"
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-100 p-2 text-violet-700">
                <FileJson className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">TOON ⇄ JSON Converter</h1>
                <p className="text-sm text-slate-500">
                  Convert between JSON and Token-Oriented Object Notation (TOON) — compact, human-readable encoding for LLM prompts
                </p>
              </div>
            </div>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-violet-700"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </header>

        <section className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => { setMode("json-to-toon"); setInput(""); setCopied(false); }}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
              mode === "json-to-toon"
                ? "border-violet-200 bg-violet-50 text-violet-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            JSON → TOON
          </button>
          <button
            onClick={() => { setMode("toon-to-json"); setInput(""); setCopied(false); }}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
              mode === "toon-to-json"
                ? "border-violet-200 bg-violet-50 text-violet-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            TOON → JSON
          </button>

          <button
            onClick={handleSwap}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Repeat2 className="h-4 w-4" />
            Swap
          </button>

          <button
            onClick={loadSample}
            className="ml-auto rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100"
          >
            Load Sample
          </button>
        </section>

        <div className="grid h-[70vh] min-h-120 grid-cols-1 gap-6 lg:h-[calc(100dvh-240px)] lg:grid-cols-2">
          <section className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-slate-700">{inputLabel}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-violet-50 hover:text-violet-700"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                </button>
                <button
                  onClick={() => { setInput(""); setCopied(false); }}
                  className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.toon,.txt,application/json"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className={cn("min-h-0 flex-1 rounded-xl border bg-white shadow-sm", error ? "border-red-300" : "border-slate-200")}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={inputPlaceholder}
                spellCheck={false}
                className="h-full w-full resize-none rounded-xl border-none bg-transparent p-4 font-mono text-sm text-slate-800 outline-none"
              />
            </div>
          </section>

          <section className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-slate-700">{outputLabel}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  disabled={!output}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
                    !output ? "cursor-not-allowed text-slate-300" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  )}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
                <button
                  onClick={handleCopy}
                  disabled={!output}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
                    !output
                      ? "cursor-not-allowed text-slate-300"
                      : copied
                        ? "bg-green-50 text-green-600"
                        : "bg-violet-50 text-violet-700 hover:bg-violet-100"
                  )}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className={cn("relative min-h-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/50 shadow-inner", error ? "border-red-200" : "")}>
              {!output && !error ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                  {outputLabel} will appear here
                </div>
              ) : null}

              <textarea
                readOnly
                value={error ? `Error:\n${error}` : output}
                spellCheck={false}
                className={cn(
                  "h-full w-full resize-none rounded-xl border-none bg-transparent p-4 font-mono text-sm outline-none",
                  error ? "text-red-600" : "text-slate-700"
                )}
              />
            </div>
          </section>
        </div>

        <p className="text-center text-sm text-slate-400">
          Powered by{" "}
          <a
            href="https://toonformat.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-500 hover:underline"
          >
            @toon-format/toon
          </a>{" "}
          — TOON is a compact encoding designed to reduce token usage in LLM prompts.
        </p>
      </div>
    </div>
  );
}
