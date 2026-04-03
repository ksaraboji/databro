"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Trash2, Key, RefreshCw, Home } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import CryptoJS from "crypto-js";

type GeneratorMode = "uuid" | "cuid" | "hash";

interface GeneratedKey {
  id: string;
  value: string;
  timestamp: Date;
}

function generateCUID(): string {
  // Simple CUID-like format: c + timestamp (base36) + random
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `c${timestamp}${randomStr}`.substring(0, 25);
}

function generateHashKey(algorithm: "SHA256" | "SHA512" | "MD5"): string {
  const timestamp = Date.now().toString();
  const random = Math.random().toString();
  const combined = timestamp + random + Math.random().toString();

  switch (algorithm) {
    case "SHA256":
      return CryptoJS.SHA256(combined).toString();
    case "SHA512":
      return CryptoJS.SHA512(combined).toString();
    case "MD5":
      return CryptoJS.MD5(combined).toString();
  }
}

export default function UUIDCUIDHashGenerator() {
  const [mode, setMode] = useState<GeneratorMode>("uuid");
  const [quantity, setQuantity] = useState(5);
  const [keys, setKeys] = useState<GeneratedKey[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hashAlgorithm, setHashAlgorithm] = useState<"SHA256" | "SHA512" | "MD5">("SHA256");

  const generateKeys = () => {
    const newKeys: GeneratedKey[] = [];
    const now = new Date();

    for (let i = 0; i < quantity; i++) {
      let value = "";

      if (mode === "uuid") {
        value = uuidv4();
      } else if (mode === "cuid") {
        value = generateCUID();
      } else if (mode === "hash") {
        value = generateHashKey(hashAlgorithm);
      }

      newKeys.push({
        id: Math.random().toString(36).substring(2, 11),
        value,
        timestamp: now,
      });
    }

    setKeys(newKeys);
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
    const allValues = keys.map((k) => k.value).join("\n");
    try {
      await navigator.clipboard.writeText(allValues);
      setCopiedId("all");
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const clearAll = () => {
    setKeys([]);
  };

  const downloadAsJSON = () => {
    const data = keys.map((k) => k.value);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${mode}-keys-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAsCSV = () => {
    const headers = ["Key", "Type", "Generated At"];
    const rows = keys.map((k) => [k.value, mode.toUpperCase(), k.timestamp.toISOString()]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${mode}-keys-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 font-sans">
      <main className="max-w-4xl mx-auto space-y-6">
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
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">UUID / CUID / Hash Generator</h1>
                <p className="text-slate-500 text-sm">Generate identifiers and hash keys</p>
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

        {/* Controls Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Mode Selection */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex flex-wrap gap-3 items-start sm:items-center justify-between">
              <div className="flex bg-slate-200 p-1 rounded-lg">
                <button
                  onClick={() => setMode("uuid")}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    mode === "uuid" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  UUID v4
                </button>
                <button
                  onClick={() => setMode("cuid")}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    mode === "cuid" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  CUID
                </button>
                <button
                  onClick={() => setMode("hash")}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    mode === "hash" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Hash Key
                </button>
              </div>

              {mode === "hash" && (
                <select
                  value={hashAlgorithm}
                  onChange={(e) => setHashAlgorithm(e.target.value as "SHA256" | "SHA512" | "MD5")}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-900 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="SHA256">SHA256</option>
                  <option value="SHA512">SHA512</option>
                  <option value="MD5">MD5</option>
                </select>
              )}
            </div>
          </div>

          {/* Generator Settings */}
          <div className="p-6 space-y-6 border-b border-slate-100">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Generate Quantity: <span className="text-purple-600 font-bold">{quantity}</span>
              </label>
              <input
                type="range"
                min="1"
                max="100"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg cursor-pointer accent-purple-600"
              />
              <div className="flex gap-2 text-xs text-slate-500">
                <span>1</span>
                <span className="flex-1"></span>
                <span>100</span>
              </div>
            </div>

            <button
              onClick={generateKeys}
              className="w-full px-6 py-2.5 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 group"
            >
              <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-300" />
              Generate {quantity} {mode === "uuid" ? "UUIDs" : mode === "cuid" ? "CUIDs" : "Keys"}
            </button>
          </div>

          {/* Description */}
          <div className="p-6 bg-slate-50/50 text-sm text-slate-600 space-y-2">
            {mode === "uuid" && (
              <>
                <p className="font-medium text-slate-700">UUID v4 (RFC 4122)</p>
                <p>128-bit random identifiers. Example: <code className="bg-white px-2 py-1 rounded text-xs">550e8400-e29b-41d4-a716-446655440000</code></p>
                <p className="text-xs text-slate-500">Perfect for: Unique user IDs, transaction IDs, database keys</p>
              </>
            )}
            {mode === "cuid" && (
              <>
                <p className="font-medium text-slate-700">CUID (Collision-resistant ID)</p>
                <p>Compact timestamp + random collision-resistant identifier. Length: ~25 chars</p>
                <p className="text-xs text-slate-500">Perfect for: User-friendly IDs, frontend tracking, cache keys</p>
              </>
            )}
            {mode === "hash" && (
              <>
                <p className="font-medium text-slate-700">{hashAlgorithm} Hash Key</p>
                <p>Cryptographic hash generated from timestamp + random entropy</p>
                <p className="text-xs text-slate-500">Perfect for: API keys, security tokens, fingerprinting</p>
              </>
            )}
          </div>
        </div>

        {/* Results Section */}
        {keys.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-3 items-center justify-between">
              <span className="text-sm font-medium text-slate-600">
                Generated {keys.length} {mode === "uuid" ? "UUIDs" : mode === "cuid" ? "CUIDs" : "Keys"}
              </span>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={copyAll}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors flex items-center gap-1"
                >
                  {copiedId === "all" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedId === "all" ? "Copied!" : "Copy All"}
                </button>
                <button
                  onClick={downloadAsJSON}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Download JSON
                </button>
                <button
                  onClick={downloadAsCSV}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Download CSV
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

            {/* Keys List */}
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {keys.map((key) => (
                <div key={key.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex-1 min-w-0 space-y-1">
                    <code className="block text-sm font-mono text-slate-900 break-all">{key.value}</code>
                    <span className="text-xs text-slate-400">{key.timestamp.toLocaleTimeString()}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(key.value, key.id)}
                    className="p-2 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
                    title="Copy to clipboard"
                  >
                    {copiedId === key.id ? (
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
        {keys.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <Key className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p>Click &quot;Generate&quot; to create your keys</p>
          </div>
        )}

        {/* Quick Tips */}
        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Quick Tips</h2>
            <p className="text-sm text-slate-500 mt-1">Choose the key style based on readability, interoperability, and entropy needs.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">What is UUID?</h3>
              <p className="text-xs text-slate-700">
                Universally Unique Identifiers are 128-bit numbers represented as 32 hex characters with hyphens. Perfect for distributed systems and databases.
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">What is CUID?</h3>
              <p className="text-xs text-slate-700">
                Collision-resistant IDs combining timestamp and random entropy. Optimized for databases and great for pagination. More readable than UUIDs.
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">What are Hash Keys?</h3>
              <p className="text-xs text-slate-700">
                Cryptographic hashes using SHA256, SHA512, or MD5. Suitable for API keys, security tokens, and key derivation functions.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
