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
import { tableFromIPC, Table, RecordBatchReader, RecordBatch, Data, MetadataVersion } from "apache-arrow";

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
  recordBatches: ArrowRecordBatchSummary[];
  bufferInternals: ArrowBufferSummary[];
  footerInternals: ArrowFooterSummary | null;
  totalBufferBytes: number;
};

type ArrowRecordBatchSummary = {
  index: number;
  numRows: number;
  numCols: number;
  nullCount: number;
  byteLength: number;
  columns: {
    name: string;
    type: string;
    nullCount: number;
    byteLength: number;
  }[];
};

type ArrowBufferSummary = {
  batchIndex: number;
  path: string;
  type: string;
  totalBytes: number;
  validityBytes: number;
  offsetBytes: number;
  dataBytes: number;
  typeIdBytes: number;
  childCount: number;
};

type ArrowFooterSummary = {
  metadataVersion: string;
  numRecordBatches: number;
  numDictionaries: number;
  recordBatchBlocks: {
    index: number;
    offset: number;
    metaDataLength: number;
    bodyLength: number;
  }[];
  dictionaryBlocks: {
    index: number;
    offset: number;
    metaDataLength: number;
    bodyLength: number;
  }[];
};

const SAMPLE_ROW_LIMIT = 20;
const SAFE_FILE_SIZE_LIMIT_BYTES = 100 * 1024 * 1024;

const formatSizeMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

function getByteLength(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const maybe = value as { byteLength?: unknown };
  return typeof maybe.byteLength === "number" ? maybe.byteLength : 0;
}

function getMetadataVersionLabel(value: number): string {
  return MetadataVersion[value] ?? `V${value}`;
}

function toSafeNumber(value: number | bigint): number {
  if (typeof value === "bigint") {
    return Number(value <= BigInt(Number.MAX_SAFE_INTEGER) ? value : BigInt(Number.MAX_SAFE_INTEGER));
  }
  return value;
}

function collectBufferSummaries(
  data: Data,
  batchIndex: number,
  path: string,
  summaries: ArrowBufferSummary[]
) {
  const summary: ArrowBufferSummary = {
    batchIndex,
    path,
    type: data.type.toString(),
    totalBytes: data.byteLength,
    validityBytes: getByteLength(data.nullBitmap),
    offsetBytes: getByteLength(data.valueOffsets),
    dataBytes: getByteLength(data.values),
    typeIdBytes: getByteLength(data.typeIds),
    childCount: data.children.length,
  };
  summaries.push(summary);

  data.children.forEach((child, childIndex) => {
    collectBufferSummaries(child, batchIndex, `${path}.${childIndex}`, summaries);
  });
}

function summarizeRecordBatch(batch: RecordBatch, index: number): ArrowRecordBatchSummary {
  const columns = batch.schema.fields.map((field, fieldIndex) => {
    const childData = batch.data.children[fieldIndex];
    return {
      name: field.name,
      type: field.type.toString(),
      nullCount: childData?.nullCount ?? 0,
      byteLength: childData?.byteLength ?? 0,
    };
  });

  return {
    index,
    numRows: batch.numRows,
    numCols: batch.numCols,
    nullCount: batch.nullCount,
    byteLength: batch.data.byteLength,
    columns,
  };
}

function summarizeFooter(ipcBytes: Uint8Array): ArrowFooterSummary | null {
  const reader = RecordBatchReader.from(ipcBytes);
  if (reader.isAsync()) return null;

  reader.open();
  if (!reader.isFile() || !reader.footer) {
    reader.cancel();
    return null;
  }

  const footer = reader.footer;
  const recordBatchBlocks = Array.from(footer.recordBatches()).map((block, index) => ({
    index,
    offset: toSafeNumber(block.offset),
    metaDataLength: toSafeNumber(block.metaDataLength),
    bodyLength: toSafeNumber(block.bodyLength),
  }));

  const dictionaryBlocks = Array.from(footer.dictionaryBatches()).map((block, index) => ({
    index,
    offset: toSafeNumber(block.offset),
    metaDataLength: toSafeNumber(block.metaDataLength),
    bodyLength: toSafeNumber(block.bodyLength),
  }));

  const summary: ArrowFooterSummary = {
    metadataVersion: getMetadataVersionLabel(footer.version),
    numRecordBatches: footer.numRecordBatches,
    numDictionaries: footer.numDictionaries,
    recordBatchBlocks,
    dictionaryBlocks,
  };

  reader.cancel();
  return summary;
}

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

function summarizeArrow(table: Table, ipcBytes: Uint8Array): ArrowInspectorResult {
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

  const recordBatches = table.batches.map((batch, index) => summarizeRecordBatch(batch, index));
  const bufferInternals: ArrowBufferSummary[] = [];
  table.batches.forEach((batch, batchIndex) => {
    collectBufferSummaries(batch.data, batchIndex, `batch${batchIndex}.root`, bufferInternals);
  });

  const footerInternals = summarizeFooter(ipcBytes);
  const totalBufferBytes = bufferInternals.reduce((sum, node) => sum + node.totalBytes, 0);

  return {
    numRows: table.numRows,
    numCols: table.numCols,
    fields,
    schemaMetadata,
    sampleRows,
    recordBatches,
    bufferInternals,
    footerInternals,
    totalBufferBytes,
  };
}

export default function ArrowInspectorPlusPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ArrowInspectorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bufferView, setBufferView] = useState<"compact" | "expanded">("compact");

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
      const ipcBytes = new Uint8Array(buffer);
      const table = tableFromIPC(ipcBytes);
      setResult(summarizeArrow(table, ipcBytes));
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
                <p className="text-slate-500 text-sm">Inspect Arrow schema, record batches, buffers, footer internals, and sample rows</p>
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
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
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
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Record Batches</p>
                <p className="text-2xl font-bold text-slate-900 mt-2">{result.recordBatches.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Buffer Bytes</p>
                <p className="text-2xl font-bold text-slate-900 mt-2">{formatBytes(result.totalBufferBytes)}</p>
              </div>
            </section>

            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-xl font-bold text-slate-900">IPC Footer Internals</h2>
                <p className="text-sm text-slate-500 mt-1">Footer metadata version and block-level offsets for record and dictionary batches.</p>
              </div>
              {result.footerInternals ? (
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Metadata Version</p>
                      <p className="text-lg font-bold text-slate-900 mt-1">{result.footerInternals.metadataVersion}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Record Batch Blocks</p>
                      <p className="text-lg font-bold text-slate-900 mt-1">{result.footerInternals.numRecordBatches}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dictionary Blocks</p>
                      <p className="text-lg font-bold text-slate-900 mt-1">{result.footerInternals.numDictionaries}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Record Batch Blocks</h3>
                    {result.footerInternals.recordBatchBlocks.length ? (
                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide text-xs">
                            <tr>
                              <th className="text-left px-4 py-3">Index</th>
                              <th className="text-left px-4 py-3">Offset</th>
                              <th className="text-left px-4 py-3">Metadata Length</th>
                              <th className="text-left px-4 py-3">Body Length</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.footerInternals.recordBatchBlocks.map((block) => (
                              <tr key={`rb-${block.index}`} className="border-t border-slate-100">
                                <td className="px-4 py-3 text-slate-700">{block.index}</td>
                                <td className="px-4 py-3 text-slate-700">{block.offset}</td>
                                <td className="px-4 py-3 text-slate-700">{formatBytes(block.metaDataLength)}</td>
                                <td className="px-4 py-3 text-slate-700">{formatBytes(block.bodyLength)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No record batch blocks found in footer.</p>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Dictionary Blocks</h3>
                    {result.footerInternals.dictionaryBlocks.length ? (
                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide text-xs">
                            <tr>
                              <th className="text-left px-4 py-3">Index</th>
                              <th className="text-left px-4 py-3">Offset</th>
                              <th className="text-left px-4 py-3">Metadata Length</th>
                              <th className="text-left px-4 py-3">Body Length</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.footerInternals.dictionaryBlocks.map((block) => (
                              <tr key={`dict-${block.index}`} className="border-t border-slate-100">
                                <td className="px-4 py-3 text-slate-700">{block.index}</td>
                                <td className="px-4 py-3 text-slate-700">{block.offset}</td>
                                <td className="px-4 py-3 text-slate-700">{formatBytes(block.metaDataLength)}</td>
                                <td className="px-4 py-3 text-slate-700">{formatBytes(block.bodyLength)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No dictionary blocks found in footer.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="px-6 py-8 text-sm text-slate-500">
                  Footer internals are not available for this IPC input (stream-like data may not include a file footer).
                </div>
              )}
            </section>

            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-xl font-bold text-slate-900">Record Batch Internals</h2>
                <p className="text-sm text-slate-500 mt-1">Batch-level row/column counts, null counts, and in-memory byte lengths.</p>
              </div>
              {result.recordBatches.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide text-xs">
                      <tr>
                        <th className="text-left px-4 py-3">Batch</th>
                        <th className="text-left px-4 py-3">Rows</th>
                        <th className="text-left px-4 py-3">Columns</th>
                        <th className="text-left px-4 py-3">Null Count</th>
                        <th className="text-left px-4 py-3">Batch Bytes</th>
                        <th className="text-left px-4 py-3">Columns (Bytes)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.recordBatches.map((batch) => (
                        <tr key={`batch-${batch.index}`} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-3 text-slate-700">{batch.index}</td>
                          <td className="px-4 py-3 text-slate-700">{batch.numRows}</td>
                          <td className="px-4 py-3 text-slate-700">{batch.numCols}</td>
                          <td className="px-4 py-3 text-slate-700">{batch.nullCount}</td>
                          <td className="px-4 py-3 text-slate-700">{formatBytes(batch.byteLength)}</td>
                          <td className="px-4 py-3 text-slate-700">
                            <div className="space-y-1">
                              {batch.columns.map((column) => (
                                <div key={`${batch.index}-${column.name}`} className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1">
                                  <span className="font-semibold">{column.name}</span> ({column.type}) - {formatBytes(column.byteLength)}, nulls: {column.nullCount}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-6 py-8 text-sm text-slate-500">No record batches found.</div>
              )}
            </section>

            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Buffer Internals</h2>
                  <p className="text-sm text-slate-500 mt-1">Per-node buffer breakdown (validity, offsets, data, type IDs).</p>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 self-start">
                  <button
                    type="button"
                    onClick={() => setBufferView("compact")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      bufferView === "compact"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Compact
                  </button>
                  <button
                    type="button"
                    onClick={() => setBufferView("expanded")}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      bufferView === "expanded"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Expanded
                  </button>
                </div>
              </div>
              {result.bufferInternals.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide text-xs">
                      <tr>
                        <th className="text-left px-4 py-3">Batch</th>
                        <th className="text-left px-4 py-3">Path</th>
                        <th className="text-left px-4 py-3">Type</th>
                        <th className="text-left px-4 py-3">Total</th>
                        {bufferView === "expanded" && <th className="text-left px-4 py-3">Validity</th>}
                        {bufferView === "expanded" && <th className="text-left px-4 py-3">Offsets</th>}
                        {bufferView === "expanded" && <th className="text-left px-4 py-3">Data</th>}
                        {bufferView === "expanded" && <th className="text-left px-4 py-3">Type IDs</th>}
                        <th className="text-left px-4 py-3">Children</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.bufferInternals.map((node) => (
                        <tr key={`${node.batchIndex}-${node.path}`} className="border-t border-slate-100">
                          <td className="px-4 py-3 text-slate-700">{node.batchIndex}</td>
                          <td className="px-4 py-3 text-slate-700 font-mono text-xs">{node.path}</td>
                          <td className="px-4 py-3 text-slate-700">{node.type}</td>
                          <td className="px-4 py-3 text-slate-700">{formatBytes(node.totalBytes)}</td>
                          {bufferView === "expanded" && <td className="px-4 py-3 text-slate-700">{formatBytes(node.validityBytes)}</td>}
                          {bufferView === "expanded" && <td className="px-4 py-3 text-slate-700">{formatBytes(node.offsetBytes)}</td>}
                          {bufferView === "expanded" && <td className="px-4 py-3 text-slate-700">{formatBytes(node.dataBytes)}</td>}
                          {bufferView === "expanded" && <td className="px-4 py-3 text-slate-700">{formatBytes(node.typeIdBytes)}</td>}
                          <td className="px-4 py-3 text-slate-700">{node.childCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-6 py-8 text-sm text-slate-500">No buffer internals available.</div>
              )}
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
