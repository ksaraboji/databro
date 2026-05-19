"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Loader2,
  MessageSquare,
  Play,
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
  result?: AskDataResponse["result"];
};

type AskDataResponse = {
  user_intent: string;
  llm_provider?: "huggingface" | "ollama";
  llm_model?: string;
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

type LlmProvider = "huggingface" | "ollama";

type ModelOption = {
  value: string;
  label: string;
};

const providerModelOptions: Record<LlmProvider, ModelOption[]> = {
  huggingface: [
    { value: "google/gemma-4-31B-it", label: "Gemma 4 31B Instruct" },
    { value: "google/gemma-4-26B-A4B-it", label: "Gemma 4 26B A4B Instruct" },
  ],
  ollama: [
    { value: "gemma:e2b", label: "Gemma E2B" },
    { value: "gemma4:latest", label: "Gemma 4 Latest" },
    { value: "gemma4:e4b", label: "Gemma 4 E4B" },
  ],
};

function getTypeLabel(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "CSV";
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) return "Excel";
  if (lower.endsWith(".parquet")) return "Parquet";
  if (lower.endsWith(".json")) return "JSON";
  if (lower.endsWith(".arrow") || lower.endsWith(".ipc")) return "Arrow";
  return "Data";
}

function formatAssistantMessage(response: AskDataResponse) {
  const fileType = response.schema.file_type.toUpperCase();
  const rowCount = response.schema.row_count;
  const returnedRows = response.result.returned_rows;
  const totalRows = response.result.row_count;
  const modelNote = response.llm_provider && response.llm_model
    ? ` Using ${response.llm_provider} (${response.llm_model}).`
    : "";
  const truncationNote = response.result.truncated ? " The result was truncated to the configured maximum rows." : "";

  return `Processed ${rowCount} ${fileType} rows and returned ${returnedRows} of ${totalRows} matching rows.${modelNote}${truncationNote}`;
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
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
        "Upload a file and ask a question. The backend will analyze the uploaded data and return the answer here.",
    },
  ]);
  const [prompt, setPrompt] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<LlmProvider>("ollama");
  const [selectedModel, setSelectedModel] = useState<string>(providerModelOptions.ollama[0].value);
  const edgeFunctionBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_EDGE_FUNCTION_URL;

  const availableModels = useMemo(() => providerModelOptions[selectedProvider], [selectedProvider]);

  useEffect(() => {
    if (!availableModels.some((model) => model.value === selectedModel)) {
      setSelectedModel(availableModels[0].value);
    }
  }, [availableModels, selectedModel]);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;

    const file = incoming[0];
    const nextFile = {
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
      typeLabel: getTypeLabel(file.name),
    };

    setFiles([nextFile]);
  };

  const removeFile = (id: string) => {
    setFiles((current) => current.filter((entry) => entry.id !== id));
  };

  const sendPrompt = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isThinking) return;

    setPrompt("");
    setIsThinking(true);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    setMessages((current) => [...current, userMessage]);

    try {
      if (files.length === 0) {
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "No files are attached yet. Upload a supported file first so the backend can query it with DuckDB.",
          },
        ]);
        return;
      }

      if (!edgeFunctionBaseUrl) {
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Supabase Edge Function URL is not configured yet, so this stays as a local preview.",
          },
        ]);
        return;
      }

      const formData = new FormData();
      formData.append("user_intent", trimmed);
      formData.append("llm_provider", selectedProvider);
      formData.append("llm_model", selectedModel);
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
          result: successPayload.result,
        },
      ]);
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
      <div className="mx-auto flex w-full max-w-425 flex-col gap-8 py-8">
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
            <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
              AI Data Chat
            </h1>
            <p className="max-w-3xl text-lg leading-relaxed text-slate-600 md:text-xl">
              Upload a CSV, Excel, Parquet, JSON, or Arrow file, ask a question in natural language, and get a direct answer from the backend.
            </p>

            <div className="inline-flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Agentic stack
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
                  CrewAI
                </span>
                <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
                  Google Cloud
                </span>
              </div>
            </div>
          </motion.div>
        </header>

        <div className="flex gap-6 overflow-x-auto pb-1">
          <section className="w-80 shrink-0 space-y-6 rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
            <div className="space-y-2">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Upload className="h-5 w-5 text-indigo-600" />
                Upload File
              </h2>
              <p className="text-sm leading-relaxed text-slate-500">
                Upload a single file to analyze it in the chat.
              </p>
            </div>

            <label className={cn(
              "group block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6 transition-all hover:border-indigo-400 hover:bg-indigo-50/40",
              files.length > 0 && "border-indigo-400 bg-indigo-50/30"
            )}>
              <input
                type="file"
                accept={acceptedFiles}
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
                Attached file
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

          </section>

          <section className="flex min-h-195 min-w-180 flex-1 flex-col rounded-3xl border border-slate-200/80 bg-white/85 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <MessageSquare className="h-5 w-5 text-indigo-600" />
                    Chat Interface
                  </h2>
                  <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
                    Type a question like “give me the row count” and the backend will analyze the uploaded file and reply here.
                  </p>
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
                      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-left">
                        <div className="border-b border-slate-800 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          SQL Executed
                        </div>
                        <pre className="overflow-x-auto px-3 py-3 text-xs leading-relaxed text-slate-100">
                          <code>{message.sql}</code>
                        </pre>
                      </div>
                    )}

                    {message.result && (
                      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-left">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            SQL Output
                          </p>
                          <p className="text-xs text-slate-500">
                            {message.result.returned_rows} row{message.result.returned_rows === 1 ? "" : "s"}
                          </p>
                        </div>

                        {message.result.rows.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                              <thead className="bg-white">
                                <tr>
                                  {message.result.columns.map((column) => (
                                    <th
                                      key={column}
                                      className="whitespace-nowrap px-3 py-2 text-left font-semibold text-slate-600"
                                    >
                                      {column}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 bg-white">
                                {message.result.rows.map((row, rowIndex) => (
                                  <tr key={`${message.id}-row-${rowIndex}`}>
                                    {message.result?.columns.map((column) => (
                                      <td key={`${message.id}-${rowIndex}-${column}`} className="px-3 py-2 align-top">
                                        {formatCellValue(row[column])}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="px-3 py-3 text-xs text-slate-500">No rows returned.</div>
                        )}
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
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendPrompt(prompt);
                      }
                    }}
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

          <section className="h-fit w-80 shrink-0 space-y-3 rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              LLM Settings
            </p>
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="llm-provider" className="text-xs font-semibold text-slate-600">
                  Provider
                </label>
                <select
                  id="llm-provider"
                  value={selectedProvider}
                  onChange={(event) => setSelectedProvider(event.target.value as LlmProvider)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="huggingface">Hugging Face</option>
                  <option value="ollama">Ollama</option>
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="llm-model" className="text-xs font-semibold text-slate-600">
                  Model
                </label>
                <select
                  id="llm-model"
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  {availableModels.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>
        </div>

        <FloatingHomeButton />
      </div>
    </div>
  );
}
