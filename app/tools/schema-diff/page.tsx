"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2, ArrowLeftRight, Upload, Home } from "lucide-react";
import { parquetMetadata, parquetSchema } from "hyparquet";

type DiffType = "added" | "removed" | "changed" | "type-changed";

interface DiffEntry {
  path: string;
  type: DiffType;
  oldValue?: unknown;
  newValue?: unknown;
}

function diffObjects(a: unknown, b: unknown, path = ""): DiffEntry[] {
  const results: DiffEntry[] = [];
  const currentPath = path || "root";

  const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

  // Both are plain objects — recurse into keys
  if (isObject(a) && isObject(b)) {
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of allKeys) {
      const childPath = path ? `${path}.${key}` : key;
      if (!(key in a)) {
        results.push({ path: childPath, type: "added", newValue: (b as Record<string, unknown>)[key] });
      } else if (!(key in b)) {
        results.push({ path: childPath, type: "removed", oldValue: (a as Record<string, unknown>)[key] });
      } else {
        results.push(...diffObjects((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], childPath));
      }
    }
    return results;
  }

  // Types differ structurally
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
    results.push({ path: currentPath, type: "type-changed", oldValue: a, newValue: b });
    return results;
  }

  // Primitive comparison
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    results.push({ path: currentPath, type: "changed", oldValue: a, newValue: b });
  }

  return results;
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const SAMPLE_A = `{
  "version": 1,
  "user": {
    "id": "string",
    "name": "string",
    "role": "admin"
  },
  "createdAt": "string"
}`;

const SAMPLE_B = `{
  "version": 2,
  "user": {
    "id": "string",
    "name": "string",
    "email": "string",
    "role": "viewer"
  },
  "updatedAt": "string"
}`;

const SAFE_FILE_SIZE_LIMIT_BYTES = 25 * 1024 * 1024;

const formatSizeMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const DIFF_COLORS: Record<DiffType, { bg: string; badge: string; dot: string; label: string }> = {
  added:        { bg: "bg-green-50 border-green-200",  badge: "bg-green-100 text-green-700",  dot: "bg-green-500",  label: "Added"        },
  removed:      { bg: "bg-red-50 border-red-200",      badge: "bg-red-100 text-red-700",      dot: "bg-red-500",    label: "Removed"      },
  changed:      { bg: "bg-amber-50 border-amber-200",  badge: "bg-amber-100 text-amber-700",  dot: "bg-amber-500",  label: "Changed"      },
  "type-changed":{ bg: "bg-orange-50 border-orange-200", badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500", label: "Type Changed" },
};

export default function SchemaDiff() {
  const [schemaA, setSchemaA] = useState("");
  const [schemaB, setSchemaB] = useState("");
  const [fileErrorA, setFileErrorA] = useState<string | null>(null);
  const [fileErrorB, setFileErrorB] = useState<string | null>(null);
  const [fileNameA, setFileNameA] = useState<string>("");
  const [fileNameB, setFileNameB] = useState<string>("");

  const normalizeParquetNode = (node: {
    element: {
      name: string;
      type?: string;
      repetition_type?: string;
      logical_type?: { type?: string };
      converted_type?: string;
    };
    children: unknown[];
  }): Record<string, unknown> => {
    return {
      name: node.element.name,
      physicalType: node.element.type ?? null,
      logicalType: node.element.logical_type?.type ?? node.element.converted_type ?? null,
      repetitionType: node.element.repetition_type ?? null,
      children: node.children.map((child) => normalizeParquetNode(child as {
        element: {
          name: string;
          type?: string;
          repetition_type?: string;
          logical_type?: { type?: string };
          converted_type?: string;
        };
        children: unknown[];
      })),
    };
  };

  const parseParquetSchema = (buffer: ArrayBuffer) => {
    const metadata = parquetMetadata(buffer);
    const tree = parquetSchema(metadata);
    return {
      format: "parquet",
      version: metadata.version,
      schema: tree.children.map((node) => normalizeParquetNode(node)),
    };
  };

  const handleSchemaFileUpload = async (side: "A" | "B", file: File) => {
    const lowerName = file.name.toLowerCase();
    const setError = side === "A" ? setFileErrorA : setFileErrorB;
    const setSchema = side === "A" ? setSchemaA : setSchemaB;
    const setName = side === "A" ? setFileNameA : setFileNameB;

    try {
      setError(null);
      setName(file.name);

      if (file.size > SAFE_FILE_SIZE_LIMIT_BYTES) {
        setError(
          `File too large (${formatSizeMB(file.size)}). Recommended safe limit is ${formatSizeMB(SAFE_FILE_SIZE_LIMIT_BYTES)} for browser-side schema parsing.`
        );
        return;
      }

      if (lowerName.endsWith(".parquet")) {
        const buffer = await file.arrayBuffer();
        const parsed = parseParquetSchema(buffer);
        setSchema(JSON.stringify(parsed, null, 2));
        return;
      }

      if (lowerName.endsWith(".json")) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        setSchema(JSON.stringify(parsed, null, 2));
        return;
      }

      setError("Unsupported file type. Upload a .json or .parquet file.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse file");
    }
  };

  const result = useMemo(() => {
    if (!schemaA.trim() || !schemaB.trim()) return null;
    try {
      const a = JSON.parse(schemaA);
      const b = JSON.parse(schemaB);
      const diffs = diffObjects(a, b);
      return { diffs, error: null };
    } catch (e) {
      return { diffs: [], error: e instanceof Error ? e.message : "Invalid JSON" };
    }
  }, [schemaA, schemaB]);

  const loadSamples = () => {
    setSchemaA(SAMPLE_A);
    setSchemaB(SAMPLE_B);
  };

  const clearAll = () => {
    setSchemaA("");
    setSchemaB("");
    setFileErrorA(null);
    setFileErrorB(null);
    setFileNameA("");
    setFileNameB("");
  };

  const counts = result?.diffs.reduce(
    (acc, d) => { acc[d.type] = (acc[d.type] ?? 0) + 1; return acc; },
    {} as Record<DiffType, number>,
  );

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
                <ArrowLeftRight className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Schema Diff Tool</h1>
                <p className="text-slate-500 text-sm">Compare two JSON or Parquet schemas</p>
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

        {/* Input Panels */}
        <div className="grid lg:grid-cols-2 gap-6 flex-1">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Schema A (Before)</span>
              <div className="flex gap-2">
                <label className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100 transition-colors cursor-pointer inline-flex items-center gap-1">
                  <Upload className="w-3 h-3" />
                  Upload
                  <input
                    type="file"
                    accept=".json,.parquet,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        void handleSchemaFileUpload("A", file);
                      }
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <button
                  onClick={loadSamples}
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
              value={schemaA}
              onChange={(e) => setSchemaA(e.target.value)}
              placeholder="Paste first JSON schema/object..."
              className="flex-1 min-h-96 p-4 font-mono text-sm text-slate-900 placeholder-slate-400 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-inset"
              spellCheck={false}
            />
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/70 text-xs text-slate-500">
              {fileErrorA ? <span className="text-red-600">{fileErrorA}</span> : fileNameA ? `Loaded: ${fileNameA}` : "Input mode: paste JSON or upload .json/.parquet (recommended up to 25 MB)"}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Schema B (After)</span>
              <label className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100 transition-colors cursor-pointer inline-flex items-center gap-1">
                <Upload className="w-3 h-3" />
                Upload
                <input
                  type="file"
                  accept=".json,.parquet,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void handleSchemaFileUpload("B", file);
                    }
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            <textarea
              value={schemaB}
              onChange={(e) => setSchemaB(e.target.value)}
              placeholder="Paste second JSON schema/object..."
              className="flex-1 min-h-96 p-4 font-mono text-sm text-slate-900 placeholder-slate-400 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-inset"
              spellCheck={false}
            />
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/70 text-xs text-slate-500">
              {fileErrorB ? <span className="text-red-600">{fileErrorB}</span> : fileNameB ? `Loaded: ${fileNameB}` : "Input mode: paste JSON or upload .json/.parquet (recommended up to 25 MB)"}
            </div>
          </div>
        </div>

        {/* Error */}
        {result?.error && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-red-700 font-mono">
            {result.error}
          </div>
        )}

        {/* Summary Bar */}
        {result && !result.error && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-4">
              <span className="text-sm font-semibold text-slate-700">Diff Summary</span>
              <div className="flex flex-wrap gap-2">
                {(["added", "removed", "changed", "type-changed"] as DiffType[]).map((type) =>
                  counts?.[type] ? (
                    <span key={type} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${DIFF_COLORS[type].bg} ${DIFF_COLORS[type].badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${DIFF_COLORS[type].dot}`} />
                      {counts[type]} {DIFF_COLORS[type].label}
                    </span>
                  ) : null,
                )}
                {result.diffs.length === 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Schemas are identical
                  </span>
                )}
              </div>
            </div>

            {/* Diff Entries */}
            {result.diffs.length > 0 && (
              <div className="divide-y divide-slate-100 max-h-120 overflow-y-auto">
                {result.diffs.map((entry, i) => {
                  const colors = DIFF_COLORS[entry.type];
                  return (
                    <div key={i} className={`p-4 border-l-4 ${colors.bg} flex flex-col gap-1`}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-800">{entry.path}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}>
                          {colors.label}
                        </span>
                      </div>
                      {entry.oldValue !== undefined && (
                        <div className="flex items-start gap-2 text-xs font-mono">
                          <span className="text-red-500 mt-0.5 shrink-0">−</span>
                          <span className="text-slate-600 break-all">{formatValue(entry.oldValue)}</span>
                        </div>
                      )}
                      {entry.newValue !== undefined && (
                        <div className="flex items-start gap-2 text-xs font-mono">
                          <span className="text-green-600 mt-0.5 shrink-0">+</span>
                          <span className="text-slate-600 break-all">{formatValue(entry.newValue)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!result && (
          <div className="text-center py-16 text-slate-500">
            <ArrowLeftRight className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p>Paste two JSON objects or schemas above to see the diff</p>
          </div>
        )}

        <p className="text-center text-slate-400 text-sm">Powered by Hyparquet Schema Parsing.</p>

      </main>
    </div>
  );
}
