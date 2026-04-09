"use client";

import React, { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowLeftRight, Check, Copy, Download, Home, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Mode = "flatten" | "unflatten";

function flattenJson(input: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        out[path] = [];
        return;
      }
      value.forEach((item, index) => {
        const nextPath = path ? `${path}[${index}]` : `[${index}]`;
        walk(item, nextPath);
      });
      return;
    }

    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) {
        out[path] = {};
        return;
      }
      entries.forEach(([key, nested]) => {
        const nextPath = path ? `${path}.${key}` : key;
        walk(nested, nextPath);
      });
      return;
    }

    out[path] = value;
  };

  walk(input, "");

  if (Object.prototype.hasOwnProperty.call(out, "")) {
    return { value: out[""] };
  }

  return out;
}

function parsePath(path: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  const matcher = /([^[.\]]+)|\[(\d+)\]/g;

  let match: RegExpExecArray | null;
  while ((match = matcher.exec(path)) !== null) {
    if (match[1]) tokens.push(match[1]);
    if (match[2]) tokens.push(Number(match[2]));
  }

  return tokens;
}

function unflattenJson(flat: Record<string, unknown>): unknown {
  let root: unknown = {};

  const ensureContainer = (target: unknown, token: string | number): unknown => {
    if (typeof token === "number") {
      return Array.isArray(target) ? target : [];
    }
    return target !== null && typeof target === "object" && !Array.isArray(target) ? target : {};
  };

  Object.entries(flat).forEach(([path, value]) => {
    if (!path.trim()) return;

    const tokens = parsePath(path);
    if (tokens.length === 0) return;

    root = ensureContainer(root, tokens[0]);
    let cursor: any = root;

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      const isLast = i === tokens.length - 1;
      const nextToken = tokens[i + 1];

      if (isLast) {
        cursor[token as any] = value;
        continue;
      }

      const existing = cursor[token as any];
      if (existing === undefined || existing === null || typeof existing !== "object") {
        cursor[token as any] = typeof nextToken === "number" ? [] : {};
      }

      cursor = cursor[token as any];
    }
  });

  return root;
}

export default function JsonFlattenUnflattenPage() {
  const [mode, setMode] = useState<Mode>("flatten");
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { output, error } = useMemo(() => {
    if (!input.trim()) {
      return { output: "", error: "" };
    }

    try {
      const parsed = JSON.parse(input);
      const transformed = mode === "flatten" ? flattenJson(parsed) : unflattenJson(parsed as Record<string, unknown>);
      return { output: JSON.stringify(transformed, null, 2), error: "" };
    } catch (err) {
      if (err instanceof Error) {
        return { output: "", error: err.message };
      }
      return { output: "", error: "Invalid JSON input." };
    }
  }, [input, mode]);

  const inputPlaceholder =
    mode === "flatten"
      ? '{\n  "orders": [\n    { "id": 1, "amount": 20 }\n  ]\n}'
      : '{\n  "orders[0].id": 1,\n  "orders[0].amount": 20\n}';

  const outputPlaceholder = mode === "flatten" ? "Flattened JSON will appear here" : "Unflattened JSON will appear here";

  const handleSwap = () => {
    setMode((prev) => (prev === "flatten" ? "unflatten" : "flatten"));
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
    const blob = new Blob([output], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `json-${mode}-result.json`;
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
      setInput(text);
      setCopied(false);
    } catch (err) {
      console.error("File upload failed", err);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-indigo-50/50 p-4 font-sans sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-center justify-between border-b border-slate-200 pb-6">
          <div className="flex items-center gap-4">
            <Link href="/tools" className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 text-indigo-600">
                <ArrowLeftRight className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">JSON Flatten / Unflatten</h1>
                <p className="text-sm text-slate-500">Convert nested JSON to key-path JSON and back</p>
              </div>
            </div>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-indigo-600"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </header>

        <section className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setMode("flatten")}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
              mode === "flatten"
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            Flatten
          </button>
          <button
            onClick={() => setMode("unflatten")}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
              mode === "unflatten"
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            Unflatten
          </button>

          <button
            onClick={handleSwap}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Swap Mode
          </button>
        </section>

        <div className="grid h-[70vh] min-h-120 grid-cols-1 gap-6 lg:h-[calc(100dvh-240px)] lg:grid-cols-2">
          <section className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-slate-700">Input JSON</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                </button>
                <button
                  onClick={() => {
                    setInput("");
                    setCopied(false);
                  }}
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
              accept=".json,.txt,application/json"
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
              <span className="text-sm font-semibold text-slate-700">Output JSON</span>
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
                        : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
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
                  {outputPlaceholder}
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
      </div>
    </div>
  );
}
