"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Upload,
  Home,
} from "lucide-react";
import { parquetMetadata, parquetReadObjects, parquetSchema } from "hyparquet";

type ParquetMetadataResult = ReturnType<typeof parquetMetadata>;

type SampleRow = Record<string, unknown>;

type ColumnSummary = {
  name: string;
  physicalType: string;
  logicalType: string;
  repetitionType: string;
  precision?: number;
  scale?: number;
  codecs: string[];
  encodings: string[];
  rowGroups: number;
  totalValues: bigint;
  totalCompressedSize: bigint;
  totalUncompressedSize: bigint;
  nullCount: bigint | null;
  minPreview: string | null;
  maxPreview: string | null;
};

type RowGroupChunkSummary = {
  path: string;
  codec: string;
  physicalType: string;
  numValues: bigint;
  totalCompressedSize: bigint;
  totalUncompressedSize: bigint;
  encodings: string[];
  nullCount: bigint | null;
  minPreview: string | null;
  maxPreview: string | null;
};

type RowGroupSummary = {
  index: number;
  numRows: bigint;
  totalByteSize: bigint;
  totalCompressedSize: bigint;
  codecs: string[];
  chunks: RowGroupChunkSummary[];
};

type InspectorResult = {
  metadata: ParquetMetadataResult;
  topLevelColumns: string[];
  leafColumnCount: number;
  compressionCodecs: string[];
  keyValueMetadata: { key: string; value: string }[];
  columns: ColumnSummary[];
  rowGroups: RowGroupSummary[];
  sampleRows: SampleRow[];
};

const SAMPLE_ROW_LIMIT = 15;
const SAFE_FILE_SIZE_LIMIT_BYTES = 100 * 1024 * 1024;

const formatSizeMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function formatBytes(value: bigint | number | null | undefined) {
  if (value == null) return "-";
  const bytes = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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

function summarizeParquet(metadata: ParquetMetadataResult, sampleRows: SampleRow[]) {
  const leafSchema = metadata.schema.filter((element) => element.type);
  const schemaTree = parquetSchema(metadata);
  const topLevelColumns = schemaTree.children.map((node) => node.element.name);
  const columnMap = new Map<string, ColumnSummary>();
  const rowGroups: RowGroupSummary[] = metadata.row_groups.map((group, groupIndex) => {
    const codecs = new Set<string>();
    const chunks: RowGroupChunkSummary[] = group.columns.map((chunk, columnIndex) => {
      const meta = chunk.meta_data;
      const schema = leafSchema[columnIndex];
      const path = meta?.path_in_schema.join(".") ?? schema?.name ?? `column_${columnIndex}`;
      const codec = meta?.codec ?? "UNKNOWN";
      codecs.add(codec);

      const current = columnMap.get(path) ?? {
        name: path,
        physicalType: schema?.type ?? meta?.type ?? "UNKNOWN",
        logicalType: schema?.logical_type?.type ?? schema?.converted_type ?? "-",
        repetitionType: schema?.repetition_type ?? "-",
        precision: schema?.precision,
        scale: schema?.scale,
        codecs: [],
        encodings: [],
        rowGroups: 0,
        totalValues: 0n,
        totalCompressedSize: 0n,
        totalUncompressedSize: 0n,
        nullCount: 0n,
        minPreview: null,
        maxPreview: null,
      };

      current.rowGroups += 1;
      current.totalValues += meta?.num_values ?? 0n;
      current.totalCompressedSize += meta?.total_compressed_size ?? 0n;
      current.totalUncompressedSize += meta?.total_uncompressed_size ?? 0n;
      if (!current.codecs.includes(codec)) current.codecs.push(codec);
      for (const encoding of meta?.encodings ?? []) {
        if (!current.encodings.includes(encoding)) current.encodings.push(encoding);
      }

      const stats = meta?.statistics;
      if (stats?.null_count != null) {
        current.nullCount = (current.nullCount ?? 0n) + stats.null_count;
      }
      if (current.minPreview == null && stats && (stats.min_value ?? stats.min) != null) {
        current.minPreview = formatValue(stats.min_value ?? stats.min);
      }
      if (current.maxPreview == null && stats && (stats.max_value ?? stats.max) != null) {
        current.maxPreview = formatValue(stats.max_value ?? stats.max);
      }
      columnMap.set(path, current);

      return {
        path,
        codec,
        physicalType: meta?.type ?? schema?.type ?? "UNKNOWN",
        numValues: meta?.num_values ?? 0n,
        totalCompressedSize: meta?.total_compressed_size ?? 0n,
        totalUncompressedSize: meta?.total_uncompressed_size ?? 0n,
        encodings: meta?.encodings ?? [],
        nullCount: stats?.null_count ?? null,
        minPreview: stats && (stats.min_value ?? stats.min) != null ? formatValue(stats.min_value ?? stats.min) : null,
        maxPreview: stats && (stats.max_value ?? stats.max) != null ? formatValue(stats.max_value ?? stats.max) : null,
      };
    });

    return {
      index: groupIndex,
      numRows: group.num_rows,
      totalByteSize: group.total_byte_size,
      totalCompressedSize: group.total_compressed_size ?? 0n,
      codecs: Array.from(codecs),
      chunks,
    };
  });

  const compressionCodecs = Array.from(new Set(rowGroups.flatMap((group) => group.codecs))).sort();
  const keyValueMetadata = (metadata.key_value_metadata ?? []).map((item) => ({
    key: item.key,
    value: item.value ?? "",
  }));

  return {
    metadata,
    topLevelColumns,
    leafColumnCount: leafSchema.length,
    compressionCodecs,
    keyValueMetadata,
    columns: Array.from(columnMap.values()),
    rowGroups,
    sampleRows,
  } satisfies InspectorResult;
}

export default function ParquetInspectorPlusPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<InspectorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedRowGroup, setSelectedRowGroup] = useState(0);

  const selectedGroup = useMemo(
    () => result?.rowGroups[selectedRowGroup] ?? null,
    [result, selectedRowGroup]
  );

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    setFile(selectedFile);
    setResult(null);
    setError(null);
    setSelectedRowGroup(0);

    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith(".parquet")) {
      setError("Please choose a .parquet file.");
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
      const metadata = parquetMetadata(buffer);
      const sampleRows = await parquetReadObjects({
        file: buffer,
        rowStart: 0,
        rowEnd: SAMPLE_ROW_LIMIT,
      });
      setResult(summarizeParquet(metadata, sampleRows));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to inspect parquet file.");
    } finally {
      setLoading(false);
    }
  };

  const sampleColumns = result?.sampleRows.length ? Object.keys(result.sampleRows[0]) : [];

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
              <div className="p-2 bg-cyan-100 rounded-lg text-cyan-600">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Parquet Inspector Plus</h1>
                <p className="text-slate-500 text-sm">Inspect parquet schema, row groups, and metadata</p>
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

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-6 space-y-6">
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors relative group">
            <input
              type="file"
              accept=".parquet"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="space-y-4 pointer-events-none">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-600">
                <Upload className="w-8 h-8" />
              </div>
              <div>
                <p className="text-slate-900 font-semibold text-base sm:text-lg">
                  {file ? file.name : "Click to upload or drag and drop a Parquet file"}
                </p>
                <p className="text-slate-500 text-sm mt-1">
                  Reads the Parquet footer, row-group metadata, and a small sample without sending data anywhere.
                </p>
                <p className="text-cyan-700 text-xs font-medium mt-1">
                  Recommended safe size: up to 100 MB per file
                </p>
              </div>
            </div>
          </div>

          {loading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center gap-3 text-slate-700">
              <FileSpreadsheet className="w-5 h-5 animate-pulse" />
              Inspecting parquet footer and sampling the first {SAMPLE_ROW_LIMIT} rows...
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
                Parsed {result.leafColumnCount} leaf columns across {result.rowGroups.length} row groups with {formatValue(result.metadata.num_rows)} total rows.
              </span>
            </div>
          )}
        </div>

        {result && (
          <div className="space-y-8">
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Rows</p>
                <p className="text-2xl font-bold text-slate-900 mt-2">{formatValue(result.metadata.num_rows)}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Leaf Columns</p>
                <p className="text-2xl font-bold text-slate-900 mt-2">{result.leafColumnCount}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Row Groups</p>
                <p className="text-2xl font-bold text-slate-900 mt-2">{result.rowGroups.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Compression</p>
                <p className="text-lg font-bold text-slate-900 mt-2 wrap-break-word">
                  {result.compressionCodecs.join(", ") || "UNKNOWN"}
                </p>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="text-xl font-bold text-slate-900">Column Summary</h2>
                  <p className="text-sm text-slate-500 mt-1">Physical type, logical type, encodings, codecs, and aggregated chunk statistics.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide text-xs">
                      <tr>
                        <th className="text-left px-4 py-3">Column</th>
                        <th className="text-left px-4 py-3">Type</th>
                        <th className="text-left px-4 py-3">Codecs</th>
                        <th className="text-left px-4 py-3">Nulls</th>
                        <th className="text-left px-4 py-3">Compressed</th>
                        <th className="text-left px-4 py-3">Min / Max</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.columns.map((column) => (
                        <tr key={column.name} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-3 font-semibold text-slate-900">{column.name}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <div>{column.physicalType}</div>
                            <div className="text-xs text-slate-400 mt-1">
                              {column.logicalType !== "-" ? column.logicalType : column.repetitionType}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{column.codecs.join(", ") || "-"}</td>
                          <td className="px-4 py-3 text-slate-600">{column.nullCount == null ? "-" : formatValue(column.nullCount)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatBytes(column.totalCompressedSize)}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <div className="truncate max-w-55">min: {column.minPreview ?? "-"}</div>
                            <div className="truncate max-w-55">max: {column.maxPreview ?? "-"}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Footer Snapshot</h2>
                  <p className="text-sm text-slate-500 mt-1">Quick facts from the Parquet file footer.</p>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-slate-500">Created by</span>
                    <span className="font-medium text-slate-900 text-right break-all">{result.metadata.created_by || "Unknown"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-slate-500">Format version</span>
                    <span className="font-medium text-slate-900">{result.metadata.version}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-slate-500">Footer metadata length</span>
                    <span className="font-medium text-slate-900">{formatBytes(result.metadata.metadata_length)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-slate-500">Top-level columns</span>
                    <span className="font-medium text-slate-900 text-right">{result.topLevelColumns.join(", ") || "-"}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Key / Value Metadata</h3>
                  {result.keyValueMetadata.length ? (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {result.keyValueMetadata.map((item) => (
                        <div key={item.key} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">{item.key}</div>
                          <div className="text-sm text-slate-700 wrap-break-word mt-1">{item.value || "(empty)"}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No custom footer key/value metadata present.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Row Groups</h2>
                  <p className="text-sm text-slate-500 mt-1">Each row group exposes its own chunk sizes, codecs, and chunk-level statistics.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.rowGroups.map((group) => (
                    <button
                      key={group.index}
                      onClick={() => setSelectedRowGroup(group.index)}
                      className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${selectedRowGroup === group.index ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                    >
                      Group {group.index + 1}
                    </button>
                  ))}
                </div>
              </div>

              {selectedGroup && (
                <div className="space-y-4 p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Rows in group</div>
                      <div className="text-xl font-bold text-slate-900 mt-2">{formatValue(selectedGroup.numRows)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Compressed bytes</div>
                      <div className="text-xl font-bold text-slate-900 mt-2">{formatBytes(selectedGroup.totalCompressedSize)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Codecs</div>
                      <div className="text-lg font-bold text-slate-900 mt-2 wrap-break-word">{selectedGroup.codecs.join(", ") || "UNKNOWN"}</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide text-xs">
                        <tr>
                          <th className="text-left px-4 py-3">Chunk</th>
                          <th className="text-left px-4 py-3">Codec</th>
                          <th className="text-left px-4 py-3">Values</th>
                          <th className="text-left px-4 py-3">Compressed</th>
                          <th className="text-left px-4 py-3">Encodings</th>
                          <th className="text-left px-4 py-3">Stats</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedGroup.chunks.map((chunk) => (
                          <tr key={`${selectedGroup.index}-${chunk.path}`} className="border-t border-slate-100 align-top">
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              <div>{chunk.path}</div>
                              <div className="text-xs text-slate-400 mt-1">{chunk.physicalType}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{chunk.codec}</td>
                            <td className="px-4 py-3 text-slate-600">{formatValue(chunk.numValues)}</td>
                            <td className="px-4 py-3 text-slate-600">{formatBytes(chunk.totalCompressedSize)}</td>
                            <td className="px-4 py-3 text-slate-600">{chunk.encodings.join(", ") || "-"}</td>
                            <td className="px-4 py-3 text-slate-600">
                              <div>min: {chunk.minPreview ?? "-"}</div>
                              <div>max: {chunk.maxPreview ?? "-"}</div>
                              <div>nulls: {chunk.nullCount == null ? "-" : formatValue(chunk.nullCount)}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-xl font-bold text-slate-900">Sample Rows</h2>
                <p className="text-sm text-slate-500 mt-1">First {result.sampleRows.length} rows read through hyparquet for a quick sanity check.</p>
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

        <p className="text-center text-slate-400 text-sm">Powered by Hyparquet.</p>
      </main>
    </div>
  );
}