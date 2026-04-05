"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Binary,
  Upload,
  Home,
} from "lucide-react";
import { tableFromIPC, Table } from "apache-arrow";

type SampleRow = Record<string, unknown>;

type ArrowFieldSummary = {
  name: string;
  type: string;
  nullable: boolean;
  metadataEntries: { key: string; value: string }[];
};

type ArrowInspectorResult = {
  numRows: number;
  numCols: number;
  fields: ArrowFieldSummary[];
  schemaMetadata: { key: string; value: string }[];
  sampleRows: SampleRow[];
};

const SAMPLE_ROW_LIMIT = 20;
const SAFE_FILE_SIZE_LIMIT_BYTES = 100 * 1024 * 1024;

const formatSizeMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function formatValue(value: unknown) {
  if (value == null) return "-";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return `Uint8Array(${value.length})`;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function summarizeArrow(table: Table): ArrowInspectorResult {
  const fields: ArrowFieldSummary[] = table.schema.fields.map((field) => ({
    name: field.name,
    type: field.type.toString(),
    nullable: field.nullable,
    metadataEntries: field.metadata
      ? Array.from(field.metadata.entries()).map(([key, value]) => ({ key, value }))
      : [],
  }));

  const schemaMetadata = table.schema.metadata
    ? Array.from(table.schema.metadata.entries()).map(([key, value]) => ({ key, value }))
    : [];

  const sampleRows = table
    .toArray()
    .slice(0, SAMPLE_ROW_LIMIT)
    .map((row) => row.toJSON() as SampleRow);

  return {
    numRows: table.numRows,
    numCols: table.numCols,
    fields,
    schemaMetadata,
    sampleRows,
  };
}

export default function ArrowInspectorPlusPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ArrowInspectorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sampleColumns = useMemo(
    () => (result?.sampleRows.length ? Object.keys(result.sampleRows[0]) : []),
    [result]
  );

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    setFile(selectedFile);
    setResult(null);
    setError(null);

    if (!selectedFile) return;
    const lower = selectedFile.name.toLowerCase();
    if (!lower.endsWith(".arrow") && !lower.endsWith(".ipc")) {
      setError("Please choose an .arrow or .ipc file.");
      return;
    }
    if (selectedFile.size > SAFE_FILE_SIZE_LIMIT_BYTES) {
      setFile(null);
      setError(
        `File too large (${formatSizeMB(selectedFile.size)}). Recommended safe limit is ${formatSizeMB(SAFE_FILE_SIZE_LIMIT_BYTES)} for browser-side inspection.`
      );
      return;
    }

    setLoading(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const table = tableFromIPC(new Uint8Array(buffer));
      setResult(summarizeArrow(table));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to inspect arrow file.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 font-sans">
      <main className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between pb-6 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <Link
              href="/tools"
              className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-sky-100 border border-sky-200 rounded-xl text-sky-700 flex items-center justify-center shadow-sm">
                <Binary className="w-7 h-7 stroke-[2.4]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Arrow Inspector Plus</h1>
                <p className="text-slate-500 text-sm">Inspect Arrow schema, field metadata, and sample rows</p>
              </div>
            </div>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-sky-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-50"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-6 space-y-6">
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors relative group">
            <input
              type="file"
              accept=".arrow,.ipc"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="space-y-4 pointer-events-none">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-600">
                <Upload className="w-8 h-8" />
              </div>
              <div>
                <p className="text-slate-900 font-semibold text-base sm:text-lg">
                  {file ? file.name : "Click to upload or drag and drop an Arrow file"}
                </p>
                <p className="text-slate-500 text-sm mt-1">
                  Reads Arrow schema metadata and sample rows locally in your browser.
                </p>
                <p className="text-sky-700 text-xs font-medium mt-1">
                  Recommended safe size: up to 100 MB per file
                </p>
              </div>
            </div>
          </div>

          {loading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center gap-3 text-slate-700">
              <Binary className="w-5 h-5 animate-pulse" />
              Inspecting schema and sampling the first {SAMPLE_ROW_LIMIT} rows...
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 flex items-start gap-3 text-red-800">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 flex items-start gap-3 text-emerald-800">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <span>
                Parsed {result.numCols} columns and {result.numRows} rows from Arrow IPC data.
              </span>
            </div>
          )}
        </div>

        {result && (
          <div className="space-y-8">
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Rows</p>
                <p className="text-2xl font-bold text-slate-900 mt-2">{result.numRows}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Columns</p>
                <p className="text-2xl font-bold text-slate-900 mt-2">{result.numCols}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Field Metadata Entries</p>
                <p className="text-2xl font-bold text-slate-900 mt-2">
                  {result.fields.reduce((sum, field) => sum + field.metadataEntries.length, 0)}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Schema Metadata Entries</p>
                <p className="text-2xl font-bold text-slate-900 mt-2">{result.schemaMetadata.length}</p>
              </div>
            </section>

            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-xl font-bold text-slate-900">Field Summary</h2>
                <p className="text-sm text-slate-500 mt-1">Arrow field names, types, nullability, and field metadata.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide text-xs">
                    <tr>
                      <th className="text-left px-4 py-3">Field</th>
                      <th className="text-left px-4 py-3">Type</th>
                      <th className="text-left px-4 py-3">Nullable</th>
                      <th className="text-left px-4 py-3">Metadata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.fields.map((field) => (
                      <tr key={field.name} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-3 font-semibold text-slate-900">{field.name}</td>
                        <td className="px-4 py-3 text-slate-600">{field.type}</td>
                        <td className="px-4 py-3 text-slate-600">{field.nullable ? "Yes" : "No"}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {field.metadataEntries.length ? (
                            <div className="space-y-1 max-w-80">
                              {field.metadataEntries.map((entry) => (
                                <div key={`${field.name}-${entry.key}`} className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1">
                                  <span className="font-semibold">{entry.key}:</span> {entry.value}
                                </div>
                              ))}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-xl font-bold text-slate-900">Schema Metadata</h2>
              </div>
              {result.schemaMetadata.length ? (
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {result.schemaMetadata.map((entry) => (
                    <div key={entry.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">{entry.key}</div>
                      <div className="text-sm text-slate-700 mt-1 break-all">{entry.value}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-8 text-sm text-slate-500">No schema metadata entries found.</div>
              )}
            </section>

            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-xl font-bold text-slate-900">Sample Rows</h2>
                <p className="text-sm text-slate-500 mt-1">First {result.sampleRows.length} rows from the Arrow file.</p>
              </div>
              {result.sampleRows.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide text-xs">
                      <tr>
                        {sampleColumns.map((column) => (
                          <th key={column} className="text-left px-4 py-3">{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.sampleRows.map((row, index) => (
                        <tr key={index} className="border-t border-slate-100 align-top">
                          {sampleColumns.map((column) => (
                            <td key={column} className="px-4 py-3 text-slate-700 max-w-60 truncate">
                              {formatValue(row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-6 py-8 text-sm text-slate-500">No sample rows were returned for this file.</div>
              )}
            </section>
          </div>
        )}

        <p className="text-center text-slate-400 text-sm">Powered by Apache Arrow.</p>
      </main>
    </div>
  );
}
