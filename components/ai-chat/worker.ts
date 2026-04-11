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

interface CachedChunk {
    id: string;
    keywords: string[];
    text: string;
    embedding: number[];
}

interface RetrievalConfig {
    topK: number;
    topKCandidates: number;
    semanticWeight: number;
    keywordWeight: number;
    minConfidence: number;
    minMeanTop3: number;
}

interface ScoredCandidate {
    chunk: CachedChunk;
    semantic: number;
    keyword: number;
    final: number;
}

interface RetrievalResult {
    chunks: CachedChunk[];
    topScore: number;
    meanTop3: number;
}

interface ContextAssembly {
    contextText: string;
    citations: string[];
}

const RETRIEVAL_CONFIG: RetrievalConfig = {
    topK: 4,
    topKCandidates: 8,
    semanticWeight: 0.7,
    keywordWeight: 0.3,
    minConfidence: 0.28,
    minMeanTop3: 0.22,
};

class AI {
    static llmEngine: MLCEngine | null = null;
    static embedderPipeline: unknown = null;
    static contextHash: string | null = null;
    static cachedChunks: CachedChunk[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            } catch (error: unknown) {
                console.error("WebLLM Engine Init Error:", error);
                
                // Specific handling for QuotaExceededError
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((error as any).name === 'QuotaExceededError' || (error as any).message?.includes('Quota exceeded')) {
                    throw new Error("Browser storage full. This model requires ~400MB of local storage. Please clear your browser cache/site data for this page and try again.");
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

function hashString(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 33) ^ input.charCodeAt(i);
    }
    return String(hash >>> 0);
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

function normalizeChunks(contextJSON: string): ContextChunk[] {
    try {
        const parsed = JSON.parse(contextJSON);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .filter((chunk) => chunk && typeof chunk.text === 'string' && chunk.text.trim().length > 0)
            .map((chunk, idx) => ({
                id: typeof chunk.id === 'string' && chunk.id.trim().length > 0 ? chunk.id : `chunk-${idx + 1}`,
                keywords: Array.isArray(chunk.keywords)
                    ? chunk.keywords.filter((k: unknown) => typeof k === 'string')
                    : [],
                text: chunk.text,
            }));
    } catch {
        return [];
    }
}

async function ensureContextCache(contextJSON: string): Promise<void> {
    const incomingHash = hashString(contextJSON);
    if (AI.contextHash === incomingHash && AI.cachedChunks.length > 0) {
        return;
    }

    const chunks = normalizeChunks(contextJSON);
    if (chunks.length === 0) {
        AI.cachedChunks = [];
        AI.contextHash = incomingHash;
        return;
    }

    const embedder = await AI.getEmbedder();
    if (!embedder) throw new Error('Embedder failed to initialize');

    const newCache: CachedChunk[] = [];
    for (const chunk of chunks) {
        const textForEmbedding = `${chunk.keywords.join(' ')}. ${chunk.text}`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chunkOut = await (embedder as any)(textForEmbedding, { pooling: 'mean', normalize: true });
        const chunkVec = Array.from(chunkOut.data as Float32Array);
        newCache.push({ ...chunk, embedding: chunkVec });
    }

    AI.cachedChunks = newCache;
    AI.contextHash = incomingHash;
}

function calculateKeywordScore(queryLower: string, keywords: string[]): number {
    let keywordHits = 0;
    for (const keyword of keywords) {
        const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const boundaryRegex = new RegExp(`(?:^|[^a-z0-9])${esc}(?:$|[^a-z0-9])`, 'i');
        if (boundaryRegex.test(queryLower)) keywordHits += 1;
    }
    return Math.min(keywordHits / 3, 1);
}

function calculateMeanTop3(candidates: ScoredCandidate[]): number {
    const top3 = candidates.slice(0, 3);
    if (top3.length === 0) return 0;
    const sum = top3.reduce((acc, item) => acc + item.final, 0);
    return sum / top3.length;
}

function passesConfidenceGate(topScore: number, meanTop3: number, cfg: RetrievalConfig): boolean {
    if (topScore >= 0.34) return true;
    if (topScore >= cfg.minConfidence && meanTop3 >= cfg.minMeanTop3) return true;
    return false;
}

async function findMostRelevantChunks(query: string, cfg: RetrievalConfig): Promise<RetrievalResult> {
    if (AI.cachedChunks.length === 0) return { chunks: [], topScore: 0, meanTop3: 0 };

    const q = query.toLowerCase();

    try {
        const embedder = await AI.getEmbedder();
        if (!embedder) throw new Error('Embedder failed to init');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queryOut = await (embedder as any)(query, { pooling: 'mean', normalize: true });
        const queryVec = Array.from(queryOut.data as Float32Array);

        const scored: ScoredCandidate[] = AI.cachedChunks.map((chunk) => {
            // cosineSimilarity returns [-1..1], convert to [0..1] for weighted blending.
            const semanticRaw = cosineSimilarity(queryVec, chunk.embedding);
            const semantic = Math.max(0, Math.min(1, (semanticRaw + 1) / 2));
            const keyword = calculateKeywordScore(q, chunk.keywords);
            return {
                chunk,
                semantic,
                keyword,
                final: (cfg.semanticWeight * semantic) + (cfg.keywordWeight * keyword),
            };
        });

        const candidates = scored
            .sort((a, b) => b.final - a.final)
            .slice(0, cfg.topKCandidates);

        if (candidates.length === 0) return { chunks: [], topScore: 0, meanTop3: 0 };

        const topScore = candidates[0].final;
        const meanTop3 = calculateMeanTop3(candidates);

        if (!passesConfidenceGate(topScore, meanTop3, cfg)) {
            return { chunks: [], topScore, meanTop3 };
        }

        return {
            chunks: candidates.slice(0, cfg.topK).map((c) => c.chunk),
            topScore,
            meanTop3,
        };
    } catch {
        return { chunks: [], topScore: 0, meanTop3: 0 };
    }
}

function buildContextText(chunks: CachedChunk[], maxContextChars = 2200): ContextAssembly {
    const seen = new Set<string>();
    const blocks: string[] = [];
    const citations: string[] = [];
    let used = 0;

    for (const chunk of chunks) {
        if (seen.has(chunk.id)) continue;
        const block = `[chunk:${chunk.id}] ${chunk.text}`;
        if (used + block.length > maxContextChars) break;
        seen.add(chunk.id);
        blocks.push(block);
        citations.push(chunk.id);
        used += block.length;
    }

    return {
        contextText: blocks.join('\n\n'),
        citations,
    };
}

self.addEventListener('message', async (event: MessageEvent) => {
    const { text, context } = event.data;

    self.postMessage({ status: 'initiate' });

    try {
        // Initialize WebLLM engine with progress callback
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const engine = await AI.getLLMEngine((data: any) => {
            self.postMessage({ status: 'progress', data });
        });

        await ensureContextCache(context);

        self.postMessage({ status: 'ready' });

        const retrieval = await findMostRelevantChunks(text, RETRIEVAL_CONFIG);
        const relevantChunks = retrieval.chunks;
        const contextAssembly = buildContextText(relevantChunks);
        const relevantContext = contextAssembly.contextText;
        const citations = contextAssembly.citations;
        
        if (!relevantContext) {
            const fallback = retrieval.topScore > 0
                ? `I do not have enough reliable context for that (confidence ${retrieval.topScore.toFixed(2)}). Please rephrase your question or ask about portfolio topics, architecture, hosting, and tools.`
                : "I can mostly answer questions about the tech stack, hosting, architecture, and tools used in this portfolio.";
             self.postMessage({ status: 'update', output: fallback });
             self.postMessage({ status: 'complete', output: fallback });
             return;
        }

        const messages = [
            { 
                role: "system" as const, 
                content: [
                    "You are a grounded assistant for this portfolio website.",
                    "Use ONLY the provided context chunks.",
                    "If the answer is not present in context, clearly say you do not have enough information.",
                    "Do not invent links, tools, versions, names, or facts.",
                    "Keep answers concise and factual.",
                    "End the answer with a citations line in this format: Sources: [chunk-id], [chunk-id]",
                ].join(' ')
            },
            { 
                role: "user" as const, 
                content: `Context:\n${relevantContext}\n\nQuestion: ${text}\n\nInstruction: Answer strictly from context. If unknown from context, say so explicitly.`
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

        const baseAnswer = fullResponse.trim();
        const sourcesLine = citations.length > 0
            ? `Sources: ${citations.map((id) => `[${id}]`).join(', ')}`
            : '';
        const finalAnswer = sourcesLine && !/sources\s*:/i.test(baseAnswer)
            ? `${baseAnswer}\n\n${sourcesLine}`
            : baseAnswer;

        self.postMessage({
            status: 'complete',
            output: finalAnswer,
            citations,
            confidence: retrieval.topScore,
        });

    } catch (err: unknown) {
        console.error("Worker Critical Error:", err);
        self.postMessage({ status: 'error', error: (err instanceof Error ? err.message : "Unknown AI Error") });
    }
});
