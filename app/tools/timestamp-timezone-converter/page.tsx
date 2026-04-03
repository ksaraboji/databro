"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Trash2, Clock, Home } from "lucide-react";

type ConversionMode = "timestamp" | "timezone" | "batch";

interface TimeResult {
  id: string;
  input: string;
  output: string;
  timestamp: Date;
}

const TIMEZONES = [
  { name: "UTC", offset: 0 },
  { name: "GMT", offset: 0 },
  { name: "EST", offset: -5 },
  { name: "EDT", offset: -4 },
  { name: "CST", offset: -6 },
  { name: "CDT", offset: -5 },
  { name: "MST", offset: -7 },
  { name: "MDT", offset: -6 },
  { name: "PST", offset: -8 },
  { name: "PDT", offset: -7 },
  { name: "IST", offset: 5.5 },
  { name: "JST", offset: 9 },
  { name: "AEST", offset: 10 },
  { name: "GST", offset: 4 },
  { name: "CET", offset: 1 },
  { name: "CEST", offset: 2 },
];

function isValidTimestamp(str: string): boolean {
  const num = parseFloat(str);
  if (isNaN(num)) return false;
  // Check if it's a valid Unix timestamp (seconds or milliseconds)
  const date = new Date(num < 10000000000 ? num * 1000 : num);
  return date.getTime() > 0 && date.getTime() < 8640000000000000; // 271821-04-20
}

function convertTimestampToReadable(str: string): string {
  const num = parseFloat(str);
  const timestamp = num < 10000000000 ? num * 1000 : num;
  const date = new Date(timestamp);
  return date.toISOString();
}

function convertReadableToTimestamp(str: string): { seconds: number; milliseconds: number } {
  const date = new Date(str);
  return {
    seconds: Math.floor(date.getTime() / 1000),
    milliseconds: date.getTime(),
  };
}

function convertBetweenTimezones(dateStr: string, fromTz: string, toTz: string): string {
  try {
    const date = new Date(dateStr);
    const fromOffset = TIMEZONES.find((tz) => tz.name === fromTz)?.offset || 0;
    const toOffset = TIMEZONES.find((tz) => tz.name === toTz)?.offset || 0;
    const offsetDiff = (toOffset - fromOffset) * 60 * 60 * 1000;
    const convertedDate = new Date(date.getTime() + offsetDiff);
    return convertedDate.toISOString();
  } catch {
    return "Invalid date";
  }
}

export default function TimestampTimezoneConverter() {
  const [mode, setMode] = useState<ConversionMode>("timestamp");
  const [timestampInput, setTimestampInput] = useState("");
  const [readableInput, setReadableInput] = useState(new Date().toISOString());
  const [results, setResults] = useState<TimeResult[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fromTimezone, setFromTimezone] = useState("UTC");
  const [toTimezone, setToTimezone] = useState("IST");
  const [dateForTz, setDateForTz] = useState(new Date().toISOString());

  const handleConvertTimestamp = () => {
    if (!timestampInput.trim()) return;

    if (isValidTimestamp(timestampInput)) {
      const readable = convertTimestampToReadable(timestampInput);
      addResult(timestampInput, readable);
      setTimestampInput("");
    }
  };

  const handleConvertReadable = () => {
    if (!readableInput.trim()) return;

    try {
      const { seconds, milliseconds } = convertReadableToTimestamp(readableInput);
      addResult(readableInput, `${seconds} (s) / ${milliseconds} (ms)`);
    } catch {
      alert("Invalid date format");
    }
  };

  const handleConvertTimezone = () => {
    if (!dateForTz.trim()) return;

    const converted = convertBetweenTimezones(dateForTz, fromTimezone, toTimezone);
    addResult(`${dateForTz} (${fromTimezone})`, `${converted} (${toTimezone})`);
  };

  const addResult = (input: string, output: string) => {
    const newResult: TimeResult = {
      id: Math.random().toString(36).substring(2, 11),
      input,
      output,
      timestamp: new Date(),
    };
    setResults((prev) => [newResult, ...prev.slice(0, 99)]);
  };

  const handleCopy = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const copyAll = async () => {
    const allValues = results.map((r) => `${r.input} → ${r.output}`).join("\n");
    try {
      await navigator.clipboard.writeText(allValues);
      setCopiedId("all");
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const clearAll = () => {
    setResults([]);
  };

  const currentTime = new Date();
  const utcTime = currentTime.toUTCString();

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 font-sans">
      <main className="max-w-5xl mx-auto space-y-6">
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
              <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Timestamp / Timezone Converter</h1>
                <p className="text-slate-500 text-sm">Convert timestamps and timezone values</p>
              </div>
            </div>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-50"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </header>

        {/* Current Time Display */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-slate-900">Current Time (UTC)</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1 bg-slate-50 rounded-lg p-4 border border-slate-200">
              <span className="text-xs text-slate-500 uppercase tracking-wide">ISO 8601</span>
              <code className="text-sm font-mono text-slate-900 break-all">{currentTime.toISOString()}</code>
            </div>
            <div className="space-y-1 bg-slate-50 rounded-lg p-4 border border-slate-200">
              <span className="text-xs text-slate-500 uppercase tracking-wide">UTC String</span>
              <code className="text-sm font-mono text-slate-900 break-all">{utcTime}</code>
            </div>
            <div className="space-y-1 bg-slate-50 rounded-lg p-4 border border-slate-200">
              <span className="text-xs text-slate-500 uppercase tracking-wide">Unix Seconds</span>
              <code className="text-sm font-mono text-slate-900 break-all">{Math.floor(currentTime.getTime() / 1000)}</code>
            </div>
            <div className="space-y-1 bg-slate-50 rounded-lg p-4 border border-slate-200">
              <span className="text-xs text-slate-500 uppercase tracking-wide">Unix Milliseconds</span>
              <code className="text-sm font-mono text-slate-900 break-all">{currentTime.getTime()}</code>
            </div>
          </div>
        </div>

        {/* Mode Selection */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setMode("timestamp")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === "timestamp"
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Timestamp ↔ Readable
              </button>
              <button
                onClick={() => setMode("timezone")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === "timezone"
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Timezone Converter
              </button>
            </div>
          </div>

          {/* Timestamp Converter */}
          {mode === "timestamp" && (
            <div className="p-6 space-y-6">
              {/* Unix to Readable */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">Unix Timestamp → Readable Date</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter Unix timestamp (1609459200 or 1609459200000)"
                    value={timestampInput}
                    onChange={(e) => setTimestampInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleConvertTimestamp()}
                    className="flex-1 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleConvertTimestamp}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Convert
                  </button>
                </div>
              </div>

              {/* Readable to Unix */}
              <div className="space-y-3 border-t border-slate-100 pt-6">
                <label className="block text-sm font-medium text-slate-700">Readable Date → Unix Timestamp</label>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="datetime-local"
                    value={readableInput.slice(0, 16)}
                    onChange={(e) => {
                      const d = new Date(e.target.value);
                      setReadableInput(d.toISOString());
                    }}
                    className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleConvertReadable}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Convert
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Timezone Converter */}
          {mode === "timezone" && (
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">Convert Between Timezones</label>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-600">From Timezone</label>
                    <select
                      value={fromTimezone}
                      onChange={(e) => setFromTimezone(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz.name} value={tz.name}>
                          {tz.name} (UTC {tz.offset >= 0 ? "+" : ""}{tz.offset})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-600">To Timezone</label>
                    <select
                      value={toTimezone}
                      onChange={(e) => setToTimezone(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz.name} value={tz.name}>
                          {tz.name} (UTC {tz.offset >= 0 ? "+" : ""}{tz.offset})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t border-slate-100 pt-6">
                <label className="block text-sm font-medium text-slate-700">Date & Time</label>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="datetime-local"
                    value={dateForTz.slice(0, 16)}
                    onChange={(e) => {
                      const d = new Date(e.target.value);
                      setDateForTz(d.toISOString());
                    }}
                    className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleConvertTimezone}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Convert
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Results Section */}
        {results.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-3 items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Conversions ({results.length})</span>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={copyAll}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors flex items-center gap-1"
                >
                  {copiedId === "all" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedId === "all" ? "Copied!" : "Copy All"}
                </button>
                <button
                  onClick={clearAll}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              </div>
            </div>

            {/* Results List */}
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {results.map((result) => (
                <div key={result.id} className="p-4 flex items-start justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <span className="text-xs text-slate-500">Input:</span>
                      <code className="block text-sm font-mono text-slate-900 break-all">{result.input}</code>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">Output:</span>
                      <code className="block text-sm font-mono text-blue-600 break-all font-semibold">{result.output}</code>
                    </div>
                    <span className="text-xs text-slate-400">{result.timestamp.toLocaleTimeString()}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(result.output, result.id)}
                    className="p-2 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
                    title="Copy output to clipboard"
                  >
                    {copiedId === result.id ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {results.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <Clock className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p>Start converting to see your results here</p>
          </div>
        )}

        {/* Quick Tips */}
        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Quick Tips</h2>
            <p className="text-sm text-slate-500 mt-1">Use seconds for API payloads, milliseconds for JavaScript, and ISO 8601 for human-readable interchange.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Unix Timestamp</h3>
              <p className="text-xs text-slate-700">
                Seconds or milliseconds since Jan 1, 1970 UTC. Seconds are typically 10 digits, milliseconds are 13 digits.
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">ISO 8601 Format</h3>
              <p className="text-xs text-slate-700">
                International standard date/time format: YYYY-MM-DDTHH:MM:SSZ. Used by most APIs and databases.
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Timezone Conversion</h3>
              <p className="text-xs text-slate-700">
                Convert times across different timezone offsets from UTC. Supports major timezones worldwide.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
