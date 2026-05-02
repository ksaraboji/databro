"use client";

import React, { useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, Database, Download, Home, Trash2, Upload, WandSparkles } from "lucide-react";
import Link from "next/link";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { cn } from "@/lib/utils";

const ATTRIBUTE_TYPES = new Set(["S", "N", "B", "BOOL", "NULL", "M", "L", "SS", "NS", "BS"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAttributeValue(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && ATTRIBUTE_TYPES.has(keys[0]);
}

function isItemMap(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const values = Object.values(value);
  return values.length > 0 && values.every((entry) => isAttributeValue(entry));
}

function convertDynamoJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => convertDynamoJson(entry));
  }

  if (isAttributeValue(value)) {
    return unmarshall({ value } as unknown as Record<string, AttributeValue>).value;
  }

  if (isItemMap(value)) {
    return unmarshall(value as unknown as Record<string, AttributeValue>);
  }

  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = convertDynamoJson(entry);
    }
    return out;
  }

  return value;
}

export default function DynamoDbJsonConverterPage() {
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { output, error } = useMemo(() => {
    if (!input.trim()) {
      return { output: "", error: "" };
    }

    try {
      const parsed = JSON.parse(input) as unknown;
      const converted = convertDynamoJson(parsed);
      return { output: JSON.stringify(converted, null, 2), error: "" };
    } catch (err) {
      if (err instanceof Error) {
        return { output: "", error: err.message };
      }
      return { output: "", error: "Invalid DynamoDB JSON input." };
    }
  }, [input]);

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
    link.download = "dynamodb-converted.json";
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

  const loadSample = () => {
    setInput(`{
  "Item": {
    "id": { "S": "123" },
    "isActive": { "BOOL": true },
    "age": { "N": "31" },
    "profile": {
      "M": {
        "city": { "S": "Bengaluru" },
        "skills": { "L": [{ "S": "aws" }, { "S": "typescript" }] }
      }
    },
    "tags": { "SS": ["dev", "infra"] }
  }
}`);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-cyan-50/50 p-4 font-sans sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-center justify-between border-b border-slate-200 pb-6">
          <div className="flex items-center gap-4">
            <Link href="/tools" className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-cyan-100 p-2 text-cyan-700">
                <Database className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">DynamoDB JSON Converter</h1>
                <p className="text-sm text-slate-500">Convert DynamoDB AttributeValue JSON into plain JSON with AWS SDK unmarshall</p>
              </div>
            </div>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-cyan-700"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </header>

        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 text-sm text-cyan-900">
          <WandSparkles className="h-4 w-4" />
          <span>Accepts single AttributeValue objects, item maps, scan/query payloads, and nested structures.</span>
          <button
            onClick={loadSample}
            className="ml-auto rounded-md border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-700 transition-colors hover:bg-cyan-50"
          >
            Load Sample
          </button>
        </section>

        <div className="grid h-[70vh] min-h-120 grid-cols-1 gap-6 lg:h-[calc(100dvh-240px)] lg:grid-cols-2">
          <section className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-slate-700">Input (DynamoDB JSON)</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-cyan-50 hover:text-cyan-700"
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

            <div className={cn("min-h-0 flex-1 rounded-xl border bg-white shadow-sm", error ? "border-red-300" : "border-slate-200") }>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste DynamoDB JSON here..."
                spellCheck={false}
                className="h-full w-full resize-none rounded-xl border-none bg-transparent p-4 font-mono text-sm text-slate-800 outline-none"
              />
            </div>
          </section>

          <section className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-slate-700">Output (Normal JSON)</span>
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
                        : "bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
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
                  Converted JSON will appear here
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