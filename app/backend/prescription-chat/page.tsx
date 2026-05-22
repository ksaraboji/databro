"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  ImagePlus,
  Loader2,
  Play,
  Stethoscope,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import FloatingHomeButton from "@/components/floating-home-button";

type LlmProvider = "huggingface" | "ollama";

type ModelOption = {
  value: string;
  label: string;
};

type UploadedImage = {
  id: string;
  file: File;
};

type PrescriptionResponse = {
  session_id: string;
  user_intent: string;
  llm_provider?: "huggingface" | "ollama";
  llm_model?: string;
  answer: string;
  factual_points?: string[];
  used_search?: boolean;
  extraction_reused?: boolean;
  search_cache_size?: number;
  prescription?: {
    raw_text?: string;
    structured_data?: {
      medicines?: Array<{
        medicine_name?: string;
        dosage?: string;
        frequency?: string;
        food_instruction?: string;
        duration?: string;
        notes?: string;
      }>;
      patient_instructions?: string[];
      caution_flags?: string[];
      unknown_or_unclear?: string[];
    };
  };
  safety_notice?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: PrescriptionResponse;
};

type ErrorPayload = {
  error?: string;
  detail?: string | { detail?: string };
};

const acceptedImageFiles = "image/jpeg,image/png,image/webp,image/heic,image/heif";

const providerModelOptions: Record<LlmProvider, ModelOption[]> = {
  huggingface: [
    { value: "google/gemma-4-31B-it", label: "Gemma 4 31B Instruct" },
    { value: "google/gemma-4-26B-A4B-it", label: "Gemma 4 26B A4B Instruct" },
  ],
  ollama: [
    { value: "gemma4:latest", label: "Gemma 4 Latest" },
    { value: "gemma4:e4b", label: "Gemma 4 E4B" },
    { value: "llama3.2", label: "Llama 3.2" },
  ],
};

const starterPrompts = [
  "What medicines are prescribed?",
  "Tell me dosage and frequency for each medicine.",
  "Which medicines should be taken before or after food?",
  "Why are these medicines usually prescribed?",
];

function resolveEdgeFunctionUrl(rawUrl: string, appEnv: "dev" | "prod") {
  const normalized = rawUrl.replace(/\/$/, "");
  const functionName = appEnv === "prod" ? "ask-prescription-prod" : "ask-prescription-dev";
  return normalized.endsWith(`/${functionName}`) ? normalized : `${normalized}/${functionName}`;
}

function getBackendErrorMessage(payload: ErrorPayload, responseText: string, status: number) {
  if (payload.error && payload.error.trim()) return payload.error;

  if (typeof payload.detail === "string" && payload.detail.trim()) {
    return payload.detail;
  }

  if (payload.detail && typeof payload.detail === "object") {
    const nestedDetail = payload.detail.detail;
    if (typeof nestedDetail === "string" && nestedDetail.trim()) {
      return nestedDetail;
    }
  }

  const trimmedText = responseText.trim();
  if (trimmedText) return trimmedText;

  return `Request failed with status ${status}`;
}

function newSessionId() {
  return `rx-${crypto.randomUUID()}`;
}

export default function PrescriptionChatPage() {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<LlmProvider>("huggingface");
  const [selectedModel, setSelectedModel] = useState<string>(providerModelOptions.huggingface[0].value);
  const [sessionId, setSessionId] = useState<string>(newSessionId());
  const [hasExtractedData, setHasExtractedData] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        "Upload a handwritten prescription photo and ask questions. I will extract text once per session and reuse it for follow-up questions.",
    },
  ]);

  const edgeFunctionBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_EDGE_FUNCTION_URL;

  const availableModels = useMemo(() => providerModelOptions[selectedProvider], [selectedProvider]);

  useEffect(() => {
    const existingSessionId = sessionStorage.getItem("prescription-chat-session-id");
    if (existingSessionId) {
      setSessionId(existingSessionId);
    } else {
      const id = newSessionId();
      setSessionId(id);
      sessionStorage.setItem("prescription-chat-session-id", id);
    }
  }, []);

  useEffect(() => {
    if (!availableModels.some((model) => model.value === selectedModel)) {
      setSelectedModel(availableModels[0].value);
    }
  }, [availableModels, selectedModel]);

  const addImage = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const file = incoming[0];

    setUploadedImage({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
    });
    setHasExtractedData(false);
  };

  const removeImage = () => {
    setUploadedImage(null);
    setHasExtractedData(false);
  };

  const sendPrompt = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isThinking) return;

    if (!uploadedImage && !hasExtractedData) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Upload a prescription image first. I need one image to start this session.",
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
          content: "Supabase Edge Function URL is not configured yet.",
        },
      ]);
      return;
    }

    setPrompt("");
    setIsThinking(true);

    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
      },
    ]);

    try {
      const formData = new FormData();
      formData.append("session_id", sessionId);
      formData.append("user_intent", trimmed);
      formData.append("llm_provider", selectedProvider);
      formData.append("llm_model", selectedModel);

      if (!hasExtractedData && uploadedImage) {
        formData.append("file", uploadedImage.file, uploadedImage.file.name);
      }

      const prodDomains = ["data-bro.com", "databro.dev"];
      const appEnv = prodDomains.includes(window.location.hostname) ? "prod" : "dev";
      const response = await fetch(resolveEdgeFunctionUrl(edgeFunctionBaseUrl, appEnv), {
        method: "POST",
        body: formData,
      });

      const responseText = await response.text();
      let payload: PrescriptionResponse | ErrorPayload;

      try {
        payload = JSON.parse(responseText) as PrescriptionResponse;
      } catch {
        payload = { error: responseText };
      }

      if (!response.ok) {
        throw new Error(getBackendErrorMessage(payload as ErrorPayload, responseText, response.status));
      }

      const successPayload = payload as PrescriptionResponse;
      setHasExtractedData(true);

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: successPayload.answer,
          result: successPayload,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown edge function error.";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `I could not process this request: ${message}`,
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const endSession = async () => {
    if (isThinking || !edgeFunctionBaseUrl) return;

    setIsThinking(true);
    try {
      const formData = new FormData();
      formData.append("session_id", sessionId);
      formData.append("user_intent", "end session");
      formData.append("end_session", "true");

      const prodDomains = ["data-bro.com", "databro.dev"];
      const appEnv = prodDomains.includes(window.location.hostname) ? "prod" : "dev";
      await fetch(resolveEdgeFunctionUrl(edgeFunctionBaseUrl, appEnv), {
        method: "POST",
        body: formData,
      });
    } catch {
      // Session end is best-effort.
    } finally {
      const nextSessionId = newSessionId();
      setSessionId(nextSessionId);
      sessionStorage.setItem("prescription-chat-session-id", nextSessionId);
      setUploadedImage(null);
      setHasExtractedData(false);
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "Session cleared. Upload a new prescription photo when you want to start again.",
        },
      ]);
      setPrompt("");
      setIsThinking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_36%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.10),transparent_28%),linear-gradient(135deg,#f8fafc_0%,#ffffff_35%,#fff7ed_100%)] p-4 sm:p-8 font-sans">
      <div className="mx-auto flex w-full max-w-none flex-col gap-8 py-8 2xl:max-w-screen-2xl">
        <header className="space-y-4">
          <Link
            href="/backend"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 group"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Back to Burning My Credits
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
              Prescription Insight Chat
            </h1>
            <p className="max-w-3xl text-lg leading-relaxed text-slate-600 md:text-xl">
              Upload a handwritten prescription photo and chat about extracted medicine details, dosage frequency, and timing instructions.
            </p>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-amber-900 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em]">Medical Safety Warning</p>
                  <p className="mt-1 text-sm leading-relaxed">
                    This tool is informational only and not a diagnosis or treatment plan. Always verify medicines, dosage, and food instructions with a licensed doctor or pharmacist. In emergencies, contact local emergency services.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </header>

        <div className="ask-rx-layout flex flex-col gap-6 lg:flex-row lg:items-start">
          <section className="ask-rx-left w-full space-y-5 rounded-3xl border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
            <div className="space-y-2">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <ImagePlus className="h-5 w-5 text-orange-600" />
                Upload Prescription
              </h2>
              <p className="text-sm text-slate-500">One image is enough for a session. Follow-up questions reuse extracted data.</p>
            </div>

            <label className="group block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6 transition-all hover:border-orange-400 hover:bg-orange-50/50">
              <input
                type="file"
                accept={acceptedImageFiles}
                className="sr-only"
                onChange={(event) => addImage(event.target.files)}
              />

              <div className="flex flex-col items-center gap-3 text-center">
                <div className="rounded-full bg-white p-3 text-orange-600 shadow-sm ring-1 ring-slate-200">
                  <Stethoscope className="h-7 w-7" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Click to upload prescription image</p>
                  <p className="mt-1 text-sm text-slate-500">JPG, PNG, WEBP, HEIC</p>
                </div>
              </div>
            </label>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Attached image</p>
              <div className="mt-3">
                <AnimatePresence initial={false}>
                  {uploadedImage ? (
                    <motion.div
                      key={uploadedImage.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white bg-white p-3 shadow-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{uploadedImage.file.name}</p>
                        <p className="text-xs text-slate-500">{(uploadedImage.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button
                        type="button"
                        onClick={removeImage}
                        className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Remove uploaded image"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </motion.div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                      No image attached yet.
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <button
              type="button"
              onClick={endSession}
              disabled={isThinking}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              End Session And Clear Cache
            </button>
          </section>

          <section className="ask-rx-center flex min-h-128 w-full flex-col rounded-3xl border border-slate-200/80 bg-white/90 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur lg:min-h-168 2xl:min-h-192">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-lg font-bold text-slate-900">Prescription Chat</h2>
              <p className="mt-1 text-sm text-slate-500">Session ID: {sessionId}</p>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={cn("flex gap-3", message.role === "user" ? "justify-end" : "justify-start")}
                >
                  {message.role === "assistant" && (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 shadow-sm">
                      <Bot className="h-5 w-5" />
                    </div>
                  )}

                  <div
                    className={cn(
                      "max-w-[90%] rounded-3xl px-4 py-3 shadow-sm sm:max-w-[78%]",
                      message.role === "user"
                        ? "rounded-br-md bg-slate-900 text-white"
                        : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                    )}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>

                    {message.result && (
                      <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="rounded-full bg-white px-2 py-1">Provider: {message.result.llm_provider}</span>
                          <span className="rounded-full bg-white px-2 py-1">Search cache: {message.result.search_cache_size ?? 0}</span>
                          <span className="rounded-full bg-white px-2 py-1">
                            Extraction: {message.result.extraction_reused ? "Reused" : "Fresh"}
                          </span>
                        </div>

                        {Array.isArray(message.result.factual_points) && message.result.factual_points.length > 0 && (
                          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-700">
                            {message.result.factual_points.map((point, pointIndex) => (
                              <li key={`${message.id}-fact-${pointIndex}`}>{point}</li>
                            ))}
                          </ul>
                        )}

                        {Array.isArray(message.result.prescription?.structured_data?.medicines) &&
                          message.result.prescription?.structured_data?.medicines.length > 0 && (
                            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                              <table className="min-w-full divide-y divide-slate-200 text-xs text-slate-700">
                                <thead className="bg-slate-50">
                                  <tr>
                                    <th className="px-2 py-2 text-left font-semibold">Medicine</th>
                                    <th className="px-2 py-2 text-left font-semibold">Dosage</th>
                                    <th className="px-2 py-2 text-left font-semibold">Frequency</th>
                                    <th className="px-2 py-2 text-left font-semibold">Food</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                  {message.result.prescription?.structured_data?.medicines?.map((med, medIndex) => (
                                    <tr key={`${message.id}-med-${medIndex}`}>
                                      <td className="px-2 py-2">{med.medicine_name || "-"}</td>
                                      <td className="px-2 py-2">{med.dosage || "-"}</td>
                                      <td className="px-2 py-2">{med.frequency || "-"}</td>
                                      <td className="px-2 py-2">{med.food_instruction || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                        {message.result.safety_notice && (
                          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            {message.result.safety_notice}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="border-t border-slate-200 bg-slate-50/80 px-6 py-5">
              <div className="mb-3 flex flex-wrap gap-2">
                {starterPrompts.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPrompt(item)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-orange-300 hover:text-orange-700"
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-end">
                <label className="flex-1">
                  <span className="sr-only">Ask prescription question</span>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendPrompt(prompt);
                      }
                    }}
                    placeholder="Ask anything about the uploaded prescription..."
                    className="min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-orange-400 focus:bg-white"
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
                      : "bg-orange-600 hover:-translate-y-0.5 hover:bg-orange-700"
                  )}
                >
                  {isThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Send
                </button>
              </div>
            </div>
          </section>

          <section className="ask-rx-right h-fit w-full space-y-3 rounded-3xl border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">LLM Settings</p>
            <div className="grid gap-3">
              <div className="space-y-2">
                <label htmlFor="llm-provider" className="text-xs font-semibold text-slate-600">
                  Provider
                </label>
                <select
                  id="llm-provider"
                  value={selectedProvider}
                  onChange={(event) => setSelectedProvider(event.target.value as LlmProvider)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
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
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
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

      <style jsx>{`
        @media (min-width: 1024px) {
          .ask-rx-layout {
            align-items: flex-start;
          }

          .ask-rx-left,
          .ask-rx-right {
            flex: 0 0 14rem;
            min-width: 14rem;
            max-width: 14rem;
          }

          .ask-rx-center {
            flex: 1 1 auto;
            min-width: 0;
          }
        }
      `}</style>
    </div>
  );
}
