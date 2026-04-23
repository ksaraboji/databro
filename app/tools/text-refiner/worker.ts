import { CreateMLCEngine, MLCEngine } from "@mlc-ai/web-llm";

const MODEL_CONFIGS = [
  {
    model_id: "Qwen3-0.6B-q4f16_1-MLC",
    model_lib:
      "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Qwen3-0.6B-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    model: "https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC",
    vram_required_MB: 1403.34,
    low_resource_required: true,
    overrides: {
      context_window_size: 4096,
    },
  },
  {
    model_id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    model_lib:
      "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    model: "https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC",
    vram_required_MB: 879.04,
    low_resource_required: true,
    overrides: {
      context_window_size: 4096,
    },
  },
  {
    model_id: "gemma-3-1b-it-q4f16_1-MLC",
    model_lib:
      "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/gemma-3-1b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    model: "https://huggingface.co/mlc-ai/gemma-3-1b-it-q4f16_1-MLC",
    vram_required_MB: 1400,
    low_resource_required: true,
    required_features: ["shader-f16"],
    overrides: {
      context_window_size: 4096,
    },
  },
  {
    model_id: "phi-1_5-q4f16_1-MLC",
    model_lib:
      "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/phi-1_5-q4f16_1-ctx2k_cs1k-webgpu.wasm",
    model: "https://huggingface.co/mlc-ai/phi-1_5-q4f16_1-MLC",
    vram_required_MB: 1210.09,
    low_resource_required: true,
    required_features: ["shader-f16"],
    overrides: {
      context_window_size: 2048,
    },
  },
] ;

type ModelId = (typeof MODEL_CONFIGS)[number]["model_id"];

interface RefineRequest {
  text: string;
  tone: "professional" | "commanding" | "casual" | "friendly" | "slack";
  headlineMode: "none" | "email" | "slack";
  addBullets: boolean;
  addEmojis: boolean;
}

const appConfig = {
  model_list: MODEL_CONFIGS,
};

const TONE_PROMPTS = {
  professional:
    "Keep formal, concise, and professional. Fix spelling and grammar.",
  commanding: "Be authoritative and direct. Use strong language.",
  casual: "Be conversational and relaxed. Fix spelling and grammar.",
  friendly: "Be warm and personable. Add a personal touch.",
  slack: "Keep it short and conversational for Slack. Use casual tone.",
};

const HEADLINE_PROMPTS = {
  none: "Return only the refined body text.",
  email:
    "Include a clear email subject line at the top, then the refined email body beneath it.",
  slack:
    "Include a short Slack-style headline at the top, then the refined Slack message beneath it.",
};

const REFINEMENT_RULES =
  "Always correct spelling, grammar, and punctuation. Improve clarity and wording while preserving meaning. Do not copy the input verbatim when improvements are possible. Return only final rewritten content with no commentary.";

const QWEN_STYLE_ENFORCER =
  "For Qwen: strictly follow tone and formatting instructions. Rewrite with noticeably different phrasing from the input while preserving meaning.";

const LLAMA_STYLE_ENFORCER =
  "For Llama: keep wording natural and direct, with explicit tone consistency in every sentence.";

const GEMMA_STYLE_ENFORCER =
  "For Gemma: produce polished, human-sounding prose with clear flow and concise phrasing.";

const PHI15_STYLE_ENFORCER =
  "For Phi-1.5: follow formatting rules exactly, avoid verbosity, and prioritize precise rewrites with clean grammar.";

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isQwenModel(modelId: ModelId | null) {
  return modelId?.startsWith("Qwen3-") ?? false;
}

function isLlamaModel(modelId: ModelId | null) {
  return modelId?.startsWith("Llama-") ?? false;
}

function isGemmaModel(modelId: ModelId | null) {
  return modelId?.startsWith("gemma-") ?? false;
}

function isPhi15Model(modelId: ModelId | null) {
  return modelId === "phi-1_5-q4f16_1-MLC";
}

function getModelStylePrompt(modelId: ModelId | null) {
  if (isQwenModel(modelId)) return QWEN_STYLE_ENFORCER;
  if (isPhi15Model(modelId)) return PHI15_STYLE_ENFORCER;
  if (isGemmaModel(modelId)) return GEMMA_STYLE_ENFORCER;
  if (isLlamaModel(modelId)) return LLAMA_STYLE_ENFORCER;
  return "";
}

function sanitizeModelOutput(rawText: string) {
  return rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*<think>[\s\S]*$/gi, "")
    .trim();
}

let engine: MLCEngine | null = null;
let isProcessing = false;
let currentModelId: ModelId | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  try {
    if (type === "init") {
      const modelId = payload?.modelId as ModelId | undefined;

      if (!modelId) {
        throw new Error("No model selected.");
      }

      if (!engine || currentModelId !== modelId) {
        engine = await CreateMLCEngine(modelId, {
          appConfig,
          initProgressCallback: (progress) => {
            self.postMessage({
              type: "progress",
              payload: {
                progress: progress.progress * 100,
                text: progress.text,
              },
            });
          },
        });
        currentModelId = modelId;
      }
      self.postMessage({ type: "ready", payload: { modelId } });
    } else if (type === "refine") {
      if (!engine) throw new Error("Engine not initialized");
      const activeEngine = engine;

      if (isProcessing) return;

      isProcessing = true;

      try {
        const { text, tone, headlineMode, addBullets, addEmojis } = payload as RefineRequest;
        const qwenNoThink = isQwenModel(currentModelId);
        const modelStylePrompt = getModelStylePrompt(currentModelId);

        let systemPrompt = `You are a helpful text refinement assistant. ${REFINEMENT_RULES} ${TONE_PROMPTS[tone]} ${HEADLINE_PROMPTS[headlineMode]}${modelStylePrompt ? ` ${modelStylePrompt}` : ""}`;

        if (qwenNoThink) {
          systemPrompt +=
            " Return only the final refined answer. Never output reasoning, analysis, or <think> tags.";
        }

        if (addBullets) {
          systemPrompt +=
            " You MUST return only bullet points. Each line must start with '- ' and contain a single concise idea.";
        }

        if (addEmojis) {
          systemPrompt += " Add 1-3 relevant emojis naturally in the final output. Do not omit emojis.";
        } else {
          systemPrompt += " Do not use emojis unless explicitly requested.";
        }

        const userPrompt = addBullets
          ? `${qwenNoThink ? "/no_think\n" : ""}Refine the following text. Tone: ${tone}. Headline mode: ${headlineMode}. Output requirements:\n- Return only bullet points\n- Every line must start with '- '\n- No paragraph prose\n- Follow the requested headline mode\n- No extra preamble\n${addEmojis ? "- Include 1-3 relevant emojis in the bullets\n" : ""}\nText:\n${text}`
          : `${qwenNoThink ? "/no_think\n" : ""}Refine this text. Tone: ${tone}. Headline mode: ${headlineMode}. Return only the requested refined output with no extra preamble.${addEmojis ? " Include 1-3 relevant emojis in the final text." : ""}\n\nText:\n${text}`;

        const messages: ChatMessage[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ];

        const runGeneration = async (inputMessages: ChatMessage[], emitUpdates: boolean) => {
          const chunks = await activeEngine.chat.completions.create({
            messages: inputMessages as never,
            stream: true,
            temperature: qwenNoThink ? 0.75 : 0.6,
            max_tokens: 320,
          });

          let responseText = "";
          for await (const chunk of chunks) {
            const delta = chunk.choices[0]?.delta?.content || "";
            responseText += delta;
            if (emitUpdates) {
              self.postMessage({
                type: "update",
                payload: sanitizeModelOutput(responseText),
              });
            }
          }

          return sanitizeModelOutput(responseText);
        };

        const finalOutput = await runGeneration(messages, true);

        self.postMessage({ type: "complete", payload: finalOutput });
      } catch (err: unknown) {
        throw new Error(`Generation failed: ${getErrorMessage(err)}`);
      } finally {
        isProcessing = false;
      }
    }
  } catch (error: unknown) {
    self.postMessage({
      type: "error",
      payload: getErrorMessage(error) || "Unknown error occurred",
    });
    isProcessing = false;
  }
};
