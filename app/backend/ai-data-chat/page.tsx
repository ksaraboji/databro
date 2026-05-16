"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  FileSpreadsheet,
  Home,
  Loader2,
  MessageSquare,
  Play,
  Sparkles,
  Table2,
  Upload,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import FloatingHomeButton from "@/components/floating-home-button";
import { cn } from "@/lib/utils";

type UploadedFile = {
  id: string;
  file: File;
  typeLabel: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
};

type AskDataResponse = {
  user_intent: string;
  generated_sql: string;
  schema: {
    file_type: string;
    row_count: number;
    schema: Array<{ column: string; type: string; nullable: boolean }>;
  };
  result: {
    columns: string[];
    rows: Array<Record<string, unknown>>;
    row_count: number;
    returned_rows: number;
    truncated: boolean;
  };
};

const acceptedFiles = ".csv,.xls,.xlsx,.parquet,.json,.arrow,.ipc";

const starterPrompts = [
  "Show me the top 10 rows",
  "What are the key columns and null rates?",
  "Give me a quick distribution summary",
  "Find duplicates and outliers",
];

function getTypeLabel(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "CSV";
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) return "Excel";
  if (lower.endsWith(".parquet")) return "Parquet";
  if (lower.endsWith(".json")) return "JSON";
  if (lower.endsWith(".arrow") || lower.endsWith(".ipc")) return "Arrow";
  return "Data";
}

function buildDuckDbSql(prompt: string, files: UploadedFile[]) {
  const sourceName = files[0]?.file.name || "uploaded_file";
  const lower = prompt.toLowerCase();

  if (lower.includes("top") || lower.includes("rows")) {
    return `SELECT * FROM '${sourceName}' LIMIT 10;`;
  }

  if (lower.includes("count") || lower.includes("summary")) {
    return `SELECT COUNT(*) AS row_count FROM '${sourceName}';`;
  }

  if (lower.includes("duplicate")) {
    return `SELECT *, COUNT(*) OVER (PARTITION BY *) AS duplicate_count FROM '${sourceName}' LIMIT 50;`;
  }

  if (lower.includes("null")) {
    return `SELECT COUNT(*) AS row_count, SUM(CASE WHEN * IS NULL THEN 1 ELSE 0 END) AS null_count FROM '${sourceName}';`;
  }

  return `-- DuckDB SQL draft
SELECT *
FROM '${sourceName}'
LIMIT 25;`;
}

function formatAssistantMessage(response: AskDataResponse) {
  const fileType = response.schema.file_type.toUpperCase();
  const rowCount = response.schema.row_count;
  const returnedRows = response.result.returned_rows;
  const totalRows = response.result.row_count;
  const truncationNote = response.result.truncated ? " The result was truncated to the configured maximum rows." : "";

  return `Processed ${rowCount} ${fileType} rows and returned ${returnedRows} of ${totalRows} matching rows.${truncationNote}`;
}

function resolveEdgeFunctionUrl(rawUrl: string, appEnv: "dev" | "prod") {
  const normalized = rawUrl.replace(/\/$/, "");
  const functionName = appEnv === "prod" ? "ask-data-prod" : "ask-data-dev";
  return normalized.endsWith(`/${functionName}`) ? normalized : `${normalized}/${functionName}`;
}

export default function AiDataChatPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        "Upload one or more files and ask a question. The backend will translate your intent into DuckDB SQL, run it against the uploaded data, and return insights here.",
    },
  ]);
  const [prompt, setPrompt] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const edgeFunctionBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_EDGE_FUNCTION_URL;

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;

    const nextFiles = Array.from(incoming).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
      typeLabel: getTypeLabel(file.name),
    }));

    setFiles((current) => {
      const seen = new Set(current.map((entry) => entry.id));
      const merged = [...current];
      nextFiles.forEach((entry) => {
        if (!seen.has(entry.id)) merged.push(entry);
      });
      return merged;
    });
  };

  const removeFile = (id: string) => {
    setFiles((current) => current.filter((entry) => entry.id !== id));
  };

  const sendPrompt = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isThinking) return;

    setIsThinking(true);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    setMessages((current) => [...current, userMessage]);

    try {
      if (files.length === 0) {
        const sql = buildDuckDbSql(trimmed, files);
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "No files are attached yet. Upload a supported file first so the backend can query it with DuckDB.",
            sql,
          },
        ]);
        return;
      }

      if (!edgeFunctionBaseUrl) {
        const sql = buildDuckDbSql(trimmed, files);
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Supabase Edge Function URL is not configured yet, so this stays as a local preview.",
            sql,
          },
        ]);
        return;
      }

      const formData = new FormData();
      formData.append("user_intent", trimmed);
      files.forEach((entry) => {
        formData.append("file", entry.file, entry.file.name);
      });

      const prodDomains = ["data-bro.com", "databro.dev"];
      const appEnv = prodDomains.includes(window.location.hostname) ? "prod" : "dev";

      const response = await fetch(resolveEdgeFunctionUrl(edgeFunctionBaseUrl, appEnv), {
        method: "POST",
        body: formData,
      });

      const responseText = await response.text();
      let payload: AskDataResponse | { error?: string };

      try {
        payload = JSON.parse(responseText) as AskDataResponse;
      } catch {
        payload = { error: responseText };
      }

      if (!response.ok) {
        const errorMessage = "error" in payload ? payload.error : undefined;
        throw new Error(errorMessage ?? `Request failed with status ${response.status}`);
      }

      const successPayload = payload as AskDataResponse;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: formatAssistantMessage(successPayload),
          sql: successPayload.generated_sql,
        },
      ]);
      setPrompt("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown edge function error.";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `I couldn’t reach the edge function: ${message}`,
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.12),transparent_36%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.10),transparent_28%),linear-gradient(135deg,#f8fafc_0%,#ffffff_40%,#eef2ff_100%)] p-4 sm:p-8 font-sans">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 py-8">
        <header className="space-y-4">
          <Link
            href="/backend"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 group"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Back to Burning My Credits
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-indigo-700 shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              UI Prototype
            </div>
            <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
              AI Data Chat
            </h1>
            <p className="max-w-3xl text-lg leading-relaxed text-slate-600 md:text-xl">
              Upload CSV, Excel, Parquet, JSON, or Arrow files, ask a question in natural language, and let the backend turn the intent into DuckDB SQL over your data.
            </p>
          </motion.div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
          <section className="space-y-6 rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
            <div className="space-y-2">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Upload className="h-5 w-5 text-indigo-600" />
                Upload Files
              </h2>
              <p className="text-sm leading-relaxed text-slate-500">
                The UI accepts multiple files at once so the backend can query across datasets later.
              </p>
            </div>

            <label className={cn(
              "group block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6 transition-all hover:border-indigo-400 hover:bg-indigo-50/40",
              files.length > 0 && "border-indigo-400 bg-indigo-50/30"
            )}>
              <input
                type="file"
                accept={acceptedFiles}
                multiple
                className="sr-only"
                onChange={(event) => addFiles(event.target.files)}
              />

              <div className="flex flex-col items-center gap-3 text-center">
                <div className="rounded-full bg-white p-3 text-indigo-600 shadow-sm ring-1 ring-slate-200 group-hover:scale-105 transition-transform">
                  <Table2 className="h-7 w-7" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Click to upload or drag and drop</p>
                  <p className="mt-1 text-sm text-slate-500">
                    CSV, XLSX, Parquet, JSON, Arrow
                  </p>
                </div>
              </div>
            </label>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Attached files
              </p>
              <div className="mt-3 space-y-3">
                <AnimatePresence initial={false}>
                  {files.length > 0 ? (
                    files.map((entry) => (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="flex items-start justify-between gap-3 rounded-xl border border-white bg-white p-3 shadow-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {entry.file.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {entry.typeLabel} · {(entry.file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(entry.id)}
                          className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                          aria-label={`Remove ${entry.file.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </motion.div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                      No files selected yet.
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Supported", "CSV / Excel / Parquet / JSON / Arrow"],
                ["Query engine", "DuckDB SQL"],
                ["Mode", "Chat-first analysis"],
                ["Status", "Backend-ready UI"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="flex min-h-195 flex-col rounded-3xl border border-slate-200/80 bg-white/85 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <MessageSquare className="h-5 w-5 text-indigo-600" />
                    Chat Interface
                  </h2>
                  <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
                    Type an intent like “show me the top 10 customers by revenue” and the backend can convert it to DuckDB SQL.
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
                  <Bot className="h-4 w-4" />
                  Agentic backend UI
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={cn(
                    "flex gap-3",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 shadow-sm">
                      <Bot className="h-5 w-5" />
                    </div>
                  )}

                  <div
                    className={cn(
                      "max-w-[85%] rounded-3xl px-4 py-3 shadow-sm sm:max-w-[75%]",
                      message.role === "user"
                        ? "rounded-br-md bg-slate-900 text-white"
                        : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                    )}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>

                    {message.sql && (
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-950 p-3 text-left text-xs text-slate-100">
                        <p className="mb-2 font-semibold text-slate-300">DuckDB SQL draft</p>
                        <pre className="overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed text-slate-100">
                          {message.sql}
                        </pre>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="border-t border-slate-200 bg-slate-50/70 px-6 py-5">
              <div className="mb-4 flex flex-wrap gap-2">
                {starterPrompts.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPrompt(item)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700"
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-end">
                <label className="flex-1">
                  <span className="sr-only">Ask the AI analyst</span>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Ask a question about the uploaded files..."
                    className="min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => sendPrompt(prompt)}
                  disabled={!prompt.trim() || isThinking}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-all",
                    !prompt.trim() || isThinking
                      ? "cursor-not-allowed bg-slate-300"
                      : "bg-indigo-600 hover:-translate-y-0.5 hover:bg-indigo-700"
                  )}
                >
                  {isThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Send
                </button>
              </div>
            </div>
          </section>

          <aside className="space-y-6 rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
            <div className="space-y-2">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                Analysis Workspace
              </h2>
              <p className="text-sm leading-relaxed text-slate-500">
                This panel previews the kind of output the backend can return once connected.
              </p>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-linear-to-br from-indigo-50 to-sky-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Intent to SQL</p>
              <div className="rounded-2xl border border-white/60 bg-white/80 p-4 text-sm text-slate-700 shadow-sm">
                <p className="font-semibold text-slate-900">SQL draft preview</p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-700">
{files.length > 0
  ? buildDuckDbSql(prompt || "show me the top 10 rows", files)
  : "SELECT * FROM 'uploaded_file' LIMIT 10;"}
                </pre>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Suggested insights</p>
              <ul className="mt-3 space-y-3 text-sm text-slate-600">
                {[
                  "Row counts, null rates, and duplicate detection",
                  "Top-N, averages, and distribution checks",
                  "Schema-aware queries for CSV, Excel, JSON, Parquet, and Arrow",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-indigo-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Backend flow</p>
              <ol className="mt-3 space-y-3 text-sm text-slate-600">
                {[
                  "Upload data file",
                  "Capture user intent in chat",
                  "Translate intent into DuckDB SQL",
                  "Run SQL on uploaded file",
                  "Return insights to chat",
                ].map((step, index) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white font-bold text-indigo-600 shadow-sm ring-1 ring-slate-200">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Supported now
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  "CSV",
                  "Excel",
                  "Parquet",
                  "JSON",
                  "Arrow",
                ].map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <Link
              href="/backend"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700"
            >
              <Home className="h-4 w-4" />
              Return to backend hub
            </Link>
          </aside>
        </div>

        <FloatingHomeButton />
      </div>
    </div>
  );
}