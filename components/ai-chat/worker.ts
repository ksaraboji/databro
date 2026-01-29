import { pipeline, env } from '@xenova/transformers';
import { CreateMLCEngine, MLCEngine } from "@mlc-ai/web-llm";

// Configuration
env.allowLocalModels = false;
env.useBrowserCache = true;

const GENERATION_MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

const appConfig = {
    model_list: [
        {
            "model_id": GENERATION_MODEL_ID,
            "model_lib": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
            "model": "https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/resolve/main/",
            "vram_required_MB": 800,
            "low_resource_required": true,
            "overrides": {
                "context_window_size": 1024,
            }
        }
    ]
};

interface ContextChunk {
    id: string;
    keywords: string[];
    text: string;
}

class AI {
    static llmEngine: MLCEngine | null = null;
    static embedderPipeline: any = null;

    static async getLLMEngine(progressCallback: (data: any) => void) {
        if (!this.llmEngine) {
            try {
                this.llmEngine = await CreateMLCEngine(GENERATION_MODEL_ID, {
                    appConfig,
                    initProgressCallback: (initProgress) => {
                        // Map WebLLM 0-1 progress to 0-100 for the UI
                        progressCallback({
                            status: 'progress',
                            progress: initProgress.progress * 100,
                            text: initProgress.text
                        });
                    },
                    logLevel: "INFO", // Log level for better debugging
                });
            } catch (error: any) {
                console.error("WebLLM Engine Init Error:", error);
                
                // Specific handling for QuotaExceededError
                if (error.name === 'QuotaExceededError' || error.message?.includes('Quota exceeded')) {
                    throw new Error("Browser storage full. This model requires ~700MB of local storage. Please clear your browser cache/site data for this page and try again.");
                }

                if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
                    throw new Error("Failed to download AI model. Please check your internet connection and ensure that you can access Hugging Face.");
                }
                
                throw error;
            }
        }
        return this.llmEngine;
    }

    static async getEmbedder() {
        if (!this.embedderPipeline) {
            this.embedderPipeline = await pipeline('feature-extraction', EMBEDDING_MODEL);
        }
        return this.embedderPipeline;
    }
}

function cosineSimilarity(a: number[], b: number[]) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1); 
}

async function findMostRelevantChunk(query: string, contextJSON: string): Promise<string> {
    let chunks: ContextChunk[] = [];
    try {
        chunks = JSON.parse(contextJSON);
    } catch (e) {
        return "NO_RELEVANT_CONTEXT_FOUND";
    }

    const q = query.toLowerCase();

    // --- PHASE 1: Keyword Scoring (Fast & Strict) ---
    let bestKeywordChunk: string | null = null;
    let maxKeywordScore = 0;

    for (const chunk of chunks) {
        let score = 0;
        if (Array.isArray(chunk.keywords)) {
            for (const keyword of chunk.keywords) {
                // Smarter Match: Word Boundary Check
                // Allows "c++" but prevents "ui" finding "build"
                const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const boundaryRegex = new RegExp(`(?:^|[^a-z0-9])${esc}(?:$|[^a-z0-9])`, 'i');
                
                if (boundaryRegex.test(q)) {
                    score += 1; 
                }
            }
        }
        if (score > maxKeywordScore) {
            maxKeywordScore = score;
            bestKeywordChunk = chunk.text;
        }
    }

    if (maxKeywordScore >= 1 && bestKeywordChunk) {
        return bestKeywordChunk;
    }

    // --- PHASE 2: Semantic Embedding (Deep Understanding) ---
    try {
        const embedder = await AI.getEmbedder();
        if (!embedder) throw new Error("Embedder failed to init");

        const queryOut = await embedder(query, { pooling: 'mean', normalize: true });
        const queryVec = queryOut.data;

        let bestSemScore = -1;
        let bestSemText = "NO_RELEVANT_CONTEXT_FOUND";

        for (const chunk of chunks) {
            const safeText = `${(chunk.keywords || []).join(" ")}. ${chunk.text}`;
            const chunkOut = await embedder(safeText, { pooling: 'mean', normalize: true });
            const chunkVec = chunkOut.data;

            const score = cosineSimilarity(queryVec, chunkVec);
            
            if (score > bestSemScore) {
                bestSemScore = score;
                bestSemText = chunk.text;
            }
        }

        // Increased threshold to prevent hallucinations on irrelevant queries (e.g. "India")
        if (bestSemScore > 0.25) {
            return bestSemText;
        }

    } catch (err) { }

    if (bestKeywordChunk) return bestKeywordChunk;
    return "NO_RELEVANT_CONTEXT_FOUND";
}

self.addEventListener('message', async (event: MessageEvent) => {
    const { text, context } = event.data;

    self.postMessage({ status: 'initiate' });

    try {
        // Initialize WebLLM engine with progress callback
        const engine = await AI.getLLMEngine((data: any) => {
            self.postMessage({ status: 'progress', data });
        });

        self.postMessage({ status: 'ready' });

        const relevantFact = await findMostRelevantChunk(text, context);
        
        if (relevantFact === "NO_RELEVANT_CONTEXT_FOUND") {
             const fallback = "I can mostly answer questions about the tech stack, hosting, architecture, and tools used in this portfolio.";
             self.postMessage({ status: 'update', output: fallback });
             self.postMessage({ status: 'complete', output: fallback });
             return;
        }

        const messages = [
            { 
                role: "system" as const, 
                content: "You are a helpful assistant. Your goal is to answer questions using strictly the provided context text." 
            },
            { 
                role: "user" as const, 
                content: `Context: "${relevantFact}"\n\nQuestion: ${text}\n\nInstruction: Answer the question based directly on the Context above. If the Context lists specific items or names, include them in your answer. Do not add information that is not in the text.` 
            }
        ];

        const completion = await engine.chat.completions.create({
            messages,
            stream: true,
            temperature: 0.1, // Low temperature for factual answers
            max_tokens: 128,  // Short answers appropriate for widget
        });

        let fullResponse = "";
        for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta.content || "";
            if (delta) {
                fullResponse += delta;
                self.postMessage({ status: 'update', output: fullResponse });
            }
        }

        self.postMessage({ status: 'complete', output: fullResponse.trim() });

    } catch (err: any) {
        console.error("Worker Critical Error:", err);
        self.postMessage({ status: 'error', error: err.message || "Unknown AI Error" });
    }
});
