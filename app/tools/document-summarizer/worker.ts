import { CreateMLCEngine, MLCEngine } from "@mlc-ai/web-llm";

// Configuration
// We reuse the same model ID to leverage browser cache if the user frequented the chat tool.
const GENERATION_MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

const appConfig = {
    model_list: [
        {
            "model_id": GENERATION_MODEL_ID,
            "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
            "model": "https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/resolve/main/",
            "vram_required_MB": 800,
            "low_resource_required": true,
            // We do NOT clamp context_window_size to 1024 here.
            // We want the default (usually 4k or up to 128k depending on model config, but 4k for this specific wasm lib)
        }
    ]
};

let engine: MLCEngine | null = null;
let isGenerating = false;

self.onmessage = async (e: MessageEvent) => {
    const { type, payload } = e.data;

    try {
        if (type === "init") {
            if (!engine) {
                engine = await CreateMLCEngine(GENERATION_MODEL_ID, {
                    appConfig,
                    initProgressCallback: (progress) => {
                        self.postMessage({
                            type: "progress",
                            payload: {
                                progress: progress.progress * 100,
                                text: progress.text
                            }
                        });
                    }
                });
            }
            self.postMessage({ type: "ready" });
        } 
        
        else if (type === "summarize") {
            if (!engine) throw new Error("Engine not initialized");
            if (isGenerating) return; // Prevent concurrent requests
            
            isGenerating = true;
            const { text } = payload;
            
            // Cap the text length to ensure we don't overflow the context window too badly
            // Llama 3.2 1B usually has 128k context potential but the web-llm lib might restrict to 4k or similar depending on the build.
            // Let's safe-guard at ~3000 chars (approx 750 tokens) to be safe for now, or a bit more. 
            // Actually, context_window_size in the lib URL says 'ctx4k'. So 4096 tokens.
            // 4096 tokens is roughly 15,000 chars. We should be fine with 12,000 chars.
            const truncatedText = text.length > 12000 ? text.substring(0, 12000) + "\n...(truncated)..." : text;

            const messages = [
                { 
                    role: "system", 
                    content: "You are a helpful assistant. Please summarize the user's document." 
                },
                {
                    role: "user",
                    content: `I need a summary of the following text.

TEXT:
${truncatedText}

INSTRUCTIONS:
Please provide a summary of the text above. 
1. Write a short paragraph overview.
2. List key takeaways in bullet points.
`
                }
            ];
            
            const chunks = await engine.chat.completions.create({
                messages: messages as any,
                stream: true,
                temperature: 0.2, // Lower temperature for more factual summarization
                max_tokens: 2048, 
            });

            let fullResponse = "";
            for await (const chunk of chunks) {
                const delta = chunk.choices[0]?.delta?.content || "";
                fullResponse += delta;
                self.postMessage({
                    type: "update",
                    payload: fullResponse
                });
            }

            self.postMessage({ type: "complete", payload: fullResponse });
            isGenerating = false;
        }

    } catch (err: any) {
        console.error("Summarizer Worker Error:", err);
        self.postMessage({
            type: "error",
            payload: err.message || "Unknown error occurred"
        });
        isGenerating = false;
    }
};
