"use client";

import React, { useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, Download, FileJson, Home, Repeat2, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { parse, stringify } from "yaml";
import { cn } from "@/lib/utils";

type Mode = "yaml-to-json" | "json-to-yaml";

export default function YamlJsonConverterPage() {
  const [mode, setMode] = useState<Mode>("yaml-to-json");
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { output, error } = useMemo(() => {
    if (!input.trim()) {
      return { output: "", error: "" };
    }

    try {
      if (mode === "yaml-to-json") {
        const parsed = parse(input);
        return { output: JSON.stringify(parsed, null, 2), error: "" };
      }

      const parsed = JSON.parse(input);
      return { output: stringify(parsed), error: "" };
    } catch (err) {
      if (err instanceof Error) {
        return { output: "", error: err.message };
      }
      return { output: "", error: "Invalid input format." };
    }
  }, [input, mode]);

  const inputPlaceholder =
    mode === "yaml-to-json"
      ? "Paste YAML here...\n\nexample:\nname: DataBro\nfeatures:\n  - converter\n  - inspector"
      : '{\n  "name": "DataBro",\n  "features": ["converter", "inspector"]\n}';

  const outputPlaceholder = mode === "yaml-to-json" ? "Converted JSON will appear here" : "Converted YAML will appear here";

  const handleSwapDirection = () => {
    setMode((prev) => (prev === "yaml-to-json" ? "json-to-yaml" : "yaml-to-json"));
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

    const extension = mode === "yaml-to-json" ? "json" : "yaml";
    const mimeType = mode === "yaml-to-json" ? "application/json" : "text/yaml";
    const fileName = `converted-output.${extension}`;

    const blob = new Blob([output], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const updateModeFromFileName = (fileName: string) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".yaml") || lower.endsWith(".yml")) {
      setMode("yaml-to-json");
      return;
    }
    if (lower.endsWith(".json")) {
      setMode("json-to-yaml");
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      updateModeFromFileName(file.name);
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
                <FileJson className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">YAML ⇄ JSON Converter</h1>
                <p className="text-sm text-slate-500">Convert YAML to JSON or JSON to YAML instantly in your browser</p>
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
            onClick={() => setMode("yaml-to-json")}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
              mode === "yaml-to-json"
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            YAML → JSON
          </button>
          <button
            onClick={() => setMode("json-to-yaml")}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
              mode === "json-to-yaml"
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            JSON → YAML
          </button>

          <button
            onClick={handleSwapDirection}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Repeat2 className="h-4 w-4" />
            Swap Direction
          </button>
        </section>

        <div className="grid h-[70vh] min-h-120 grid-cols-1 gap-6 lg:h-[calc(100dvh-240px)] lg:grid-cols-2">
          <section className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-slate-700">Input ({mode === "yaml-to-json" ? "YAML" : "JSON"})</span>
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
              accept=".yaml,.yml,.json,.txt,application/json,text/yaml,text/x-yaml"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className={cn("min-h-0 flex-1 rounded-xl border bg-white shadow-sm", error ? "border-red-300" : "border-slate-200") }>
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
              <span className="text-sm font-semibold text-slate-700">Output ({mode === "yaml-to-json" ? "JSON" : "YAML"})</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  disabled={!output}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
                    !output
                      ? "cursor-not-allowed text-slate-300"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
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

            <div className={cn("relative min-h-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/50 shadow-inner", error ? "border-red-200" : "") }>
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
