"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Trash2, Braces, Home } from "lucide-react";

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  required?: string[];
  additionalProperties?: boolean;
  anyOf?: JsonSchema[];
  $schema?: string;
};

function inferSchema(value: unknown): JsonSchema {
  if (value === null) return { type: "null" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { type: "integer" } : { type: "number" };
  }
  if (typeof value === "string") return { type: "string" };
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: "array", items: {} };
    const itemSchemas = value.map(inferSchema);
    return { type: "array", items: mergeSchemas(itemSchemas) };
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const properties: Record<string, JsonSchema> = {};
    for (const [k, v] of Object.entries(obj)) {
      properties[k] = inferSchema(v);
    }
    return {
      type: "object",
      properties,
      required: Object.keys(obj),
      additionalProperties: false,
    };
  }
  return {};
}

function mergeSchemas(schemas: JsonSchema[]): JsonSchema {
  if (schemas.length === 0) return {};
  if (schemas.length === 1) return schemas[0];

  const types = [...new Set(schemas.map((s) => s.type))];

  if (types.length === 1 && types[0] === "object") {
    const allKeys = [...new Set(schemas.flatMap((s) => Object.keys(s.properties ?? {})))];
    const requiredInAll = allKeys.filter((k) => schemas.every((s) => s.required?.includes(k)));
    const properties: Record<string, JsonSchema> = {};
    for (const key of allKeys) {
      const keySchemas = schemas
        .filter((s) => s.properties?.[key] !== undefined)
        .map((s) => s.properties![key]);
      properties[key] = keySchemas.length === 1 ? keySchemas[0] : mergeSchemas(keySchemas);
    }
    return { type: "object", properties, required: requiredInAll, additionalProperties: false };
  }

  if (types.length === 1) return schemas[0];

  return { anyOf: schemas };
}

const SAMPLE_JSON = `{
  "id": 1,
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "active": true,
  "score": 98.6,
  "tags": ["engineer", "pioneer"],
  "address": {
    "city": "London",
    "zip": "EC1A"
  },
  "metadata": null
}`;

export default function JsonSchemaInferrer() {
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);

  const { schema, error } = useMemo(() => {
    if (!input.trim()) return { schema: null, error: null };
    try {
      const parsed = JSON.parse(input);
      const inferred = inferSchema(parsed);
      const fullSchema: JsonSchema = {
        $schema: "http://json-schema.org/draft-07/schema#",
        ...inferred,
      };
      return { schema: JSON.stringify(fullSchema, null, 2), error: null };
    } catch (e) {
      return { schema: null, error: e instanceof Error ? e.message : "Invalid JSON" };
    }
  }, [input]);

  const handleCopy = async () => {
    if (!schema) return;
    try {
      await navigator.clipboard.writeText(schema);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const loadSample = () => setInput(SAMPLE_JSON);
  const clearAll = () => setInput("");

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 font-sans flex flex-col">
      <main className="max-w-6xl mx-auto w-full flex flex-col flex-1 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between pb-6 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <Link
              href="/tools"
              className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-100 rounded-lg text-cyan-600">
                <Braces className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">JSON Schema Inferrer</h1>
                <p className="text-slate-500 text-sm">Infer Draft-07 schema from sample JSON</p>
              </div>
            </div>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-cyan-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-50"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </header>

        {/* Main Panel */}
        <div className="grid gap-6 lg:grid-cols-2 flex-1">
          {/* Input */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-semibold text-slate-700">JSON Input</span>
              <div className="flex gap-2">
                <button
                  onClick={loadSample}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100 transition-colors"
                >
                  Load Sample
                </button>
                <button
                  onClick={clearAll}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              </div>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Paste your JSON here...\n\nExample:\n${SAMPLE_JSON}`}
              className="flex-1 min-h-0 p-4 font-mono text-sm text-slate-900 placeholder-slate-400 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-inset"
              spellCheck={false}
            />
            {error && (
              <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-xs text-red-700 font-mono">
                {error}
              </div>
            )}
          </div>

          {/* Output */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-semibold text-slate-700">Inferred Schema (Draft-07)</span>
              <button
                onClick={handleCopy}
                disabled={!schema}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied!" : "Copy Schema"}
              </button>
            </div>
            <textarea
              value={schema ?? ""}
              readOnly
              placeholder="Inferred schema will appear here as you type..."
              className="flex-1 min-h-0 p-4 font-mono text-sm text-slate-900 placeholder-slate-400 bg-white resize-none focus:outline-none"
              spellCheck={false}
            />
          </div>
        </div>

        <p className="text-center text-slate-400 text-sm">Powered by JSON Schema Draft-07 Inference.</p>

      </main>
    </div>
  );
}
