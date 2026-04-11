import { pipeline, env } from '@xenova/transformers';
import { CreateMLCEngine, MLCEngine } from "@mlc-ai/web-llm";

// Configuration
env.allowLocalModels = false;
env.useBrowserCache = true;
// Force a stable local wasm backend path in web workers to avoid import.meta.url fetch issues.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onnxWasmEnv = (env as any)?.backends?.onnx?.wasm;
if (onnxWasmEnv) {
    onnxWasmEnv.wasmPaths = '/ort/';
    onnxWasmEnv.numThreads = 1;
}

const GENERATION_MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const SHOW_DEBUG_INFO = process.env.NODE_ENV !== 'production';

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
    metadata: {
        kbVersion: string;
        source: string;
        section: string;
        tags: string[];
        chunkIndex: number;
        charStart: number;
        charEnd: number;
    };
}

interface CachedChunk {
    id: string;
    keywords: string[];
    text: string;
    embedding: number[] | null;
    metadata?: {
        kbVersion: string;
        source: string;
        section: string;
        tags: string[];
        chunkIndex: number;
        charStart: number;
        charEnd: number;
    };
}

interface RetrievalConfig {
    topK: number;
    topKCandidates: number;
    semanticWeight: number;
    keywordWeight: number;
    metadataWeight: number;
    minConfidence: number;
    minMeanTop3: number;
}

interface ScoredCandidate {
    chunk: CachedChunk;
    semantic: number;
    keyword: number;
    metadata: number;
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
    semanticWeight: 0.62,
    keywordWeight: 0.23,
    metadataWeight: 0.15,
    minConfidence: 0.28,
    minMeanTop3: 0.22,
};

class AI {
    static llmEngine: MLCEngine | null = null;
    static embedderPipeline: unknown = null;
    static embedderUnavailable = false;
    static embedderFallbackAnnounced = false;
    static embedderLastFailureAt = 0;
    static readonly embedderRetryCooldownMs = 12000;
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
        if (this.embedderUnavailable) {
            const elapsed = Date.now() - this.embedderLastFailureAt;
            if (elapsed < this.embedderRetryCooldownMs) {
                return null;
            }
            // Retry after cooldown in case this was a transient network/CDN failure.
            this.embedderUnavailable = false;
        }
        if (!this.embedderPipeline) {
            try {
                this.embedderPipeline = await pipeline('feature-extraction', EMBEDDING_MODEL);
                this.embedderFallbackAnnounced = false;
                return this.embedderPipeline;
            } catch (error) {
                console.warn('Embedding backend unavailable. Falling back to keyword-only retrieval.', error);
                this.embedderUnavailable = true;
                this.embedderLastFailureAt = Date.now();
                this.embedderPipeline = null;
                return null;
            }
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
                metadata: {
                    kbVersion: typeof chunk.metadata?.kbVersion === 'string' ? chunk.metadata.kbVersion : 'legacy',
                    source: typeof chunk.metadata?.source === 'string' ? chunk.metadata.source : 'unknown',
                    section: typeof chunk.metadata?.section === 'string' ? chunk.metadata.section : '',
                    tags: Array.isArray(chunk.metadata?.tags)
                        ? chunk.metadata.tags.filter((t: unknown) => typeof t === 'string')
                        : [],
                    chunkIndex: typeof chunk.metadata?.chunkIndex === 'number' ? chunk.metadata.chunkIndex : idx,
                    charStart: typeof chunk.metadata?.charStart === 'number' ? chunk.metadata.charStart : 0,
                    charEnd: typeof chunk.metadata?.charEnd === 'number' ? chunk.metadata.charEnd : chunk.text.length,
                },
            }));
    } catch {
        return [];
    }
}

async function ensureContextCache(contextJSON: string): Promise<void> {
    const incomingHash = hashString(contextJSON);
    const hasEmbeddedVectors = AI.cachedChunks.some((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length > 0);
    if (AI.contextHash === incomingHash && AI.cachedChunks.length > 0 && hasEmbeddedVectors) {
        return;
    }

    const chunks = normalizeChunks(contextJSON);
    if (chunks.length === 0) {
        AI.cachedChunks = [];
        AI.contextHash = incomingHash;
        return;
    }

    const embedder = await AI.getEmbedder();

    const newCache: CachedChunk[] = [];
    if (!embedder) {
        for (const chunk of chunks) {
            newCache.push({ ...chunk, embedding: null });
        }
    } else {
        for (const chunk of chunks) {
            const textForEmbedding = `${chunk.keywords.join(' ')}. ${chunk.text}`;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chunkOut = await (embedder as any)(textForEmbedding, { pooling: 'mean', normalize: true });
            const chunkVec = Array.from(chunkOut.data as Float32Array);
            newCache.push({ ...chunk, embedding: chunkVec });
        }
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

function calculateMetadataIntentScore(queryLower: string, chunk: CachedChunk): number {
    const metadata = chunk.metadata;
    if (!metadata) return 0;

    const sectionLower = metadata.section.toLowerCase();
    const tagsLower = metadata.tags.map((tag) => tag.toLowerCase());

    const intentMap: Array<{ queryTerms: string[]; targetTerms: string[] }> = [
        {
            queryTerms: ['owner', 'creator', 'who built', 'who made', 'about', 'purpose'],
            targetTerms: ['owner', 'about', 'purpose'],
        },
        {
            queryTerms: ['hosted', 'hosting', 'where hosted', 'deploy', 'deployment', 'aws', 'azure', 'infra', 'infrastructure'],
            targetTerms: ['hosting', 'infra', 'aws', 'azure', 'cloud'],
        },
        {
            queryTerms: ['tech stack', 'stack', 'frontend', 'backend', 'framework', 'libraries'],
            targetTerms: ['stack', 'frontend', 'backend', 'libraries'],
        },
        {
            queryTerms: ['ci/cd', 'cicd', 'pipeline', 'workflow', 'github actions', 'deploy flow'],
            targetTerms: ['cicd', 'workflow', 'deploy'],
        },
        {
            queryTerms: ['tool', 'tools', 'utility', 'utilities', 'url', 'link'],
            targetTerms: ['tools', 'catalog', 'urls', 'utility'],
        },
        {
            queryTerms: ['rag', 'chatbot', 'retrieval', 'embedding', 'llm', 'ai widget', 'ai chat'],
            targetTerms: ['ai', 'chatbot', 'rag', 'embeddings', 'webllm'],
        },
        {
            queryTerms: ['flow', 'request flow', 'frontend to backend', 'api gateway'],
            targetTerms: ['flow', 'request-path', 'gateway', 'api'],
        },
    ];

    let score = 0;
    for (const mapping of intentMap) {
        const hasIntent = mapping.queryTerms.some((term) => queryLower.includes(term));
        if (!hasIntent) continue;

        const termMatch = mapping.targetTerms.some((term) => sectionLower.includes(term) || tagsLower.some((tag) => tag.includes(term)));
        if (termMatch) score += 0.4;
    }

    const directSectionMatch = sectionLower.length > 0 && queryLower.includes(sectionLower);
    if (directSectionMatch) score += 0.3;

    const metadataTerms = [sectionLower, ...tagsLower].filter(Boolean);
    const lexicalMatches = metadataTerms.reduce((acc, term) => {
        const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:^|[^a-z0-9])${esc}(?:$|[^a-z0-9])`, 'i');
        return regex.test(queryLower) ? acc + 1 : acc;
    }, 0);

    if (lexicalMatches > 0) {
        score += Math.min(0.3, lexicalMatches * 0.08);
    }

    return Math.max(0, Math.min(1, score));
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
        let queryVec: number[] | null = null;

        if (embedder) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const queryOut = await (embedder as any)(query, { pooling: 'mean', normalize: true });
            queryVec = Array.from(queryOut.data as Float32Array);
        }

        const scored: ScoredCandidate[] = AI.cachedChunks.map((chunk) => {
            // cosineSimilarity returns [-1..1], convert to [0..1] for weighted blending.
            const semanticRaw = queryVec && chunk.embedding ? cosineSimilarity(queryVec, chunk.embedding) : 0;
            const semantic = queryVec && chunk.embedding ? Math.max(0, Math.min(1, (semanticRaw + 1) / 2)) : 0;
            const keyword = calculateKeywordScore(q, chunk.keywords);
            const metadata = calculateMetadataIntentScore(q, chunk);

            const semanticWeight = queryVec ? cfg.semanticWeight : 0;
            const keywordWeight = queryVec ? cfg.keywordWeight : 0.75;
            const metadataWeight = queryVec ? cfg.metadataWeight : 0.25;
            return {
                chunk,
                semantic,
                keyword,
                metadata,
                final: (semanticWeight * semantic) + (keywordWeight * keyword) + (metadataWeight * metadata),
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

function stripSourcesLine(text: string): string {
    // Remove any "Sources: [...]" line wherever it appears (start, middle, or end)
    // Covers both [chunk:id] format (model copying context) and [id] format (prompted citations)
    return text
        .replace(/\n*\s*Sources:\s*(?:\[(?:chunk:)?[^\]]+\](?:,\s*)?)+\s*\n?/gi, '\n')
        .trim();
}

function buildGroundedFallbackFromChunks(chunks: CachedChunk[]): string {
    if (!chunks.length) {
        return 'I could not generate a complete answer from the local model for this question.';
    }

    const primary = chunks[0].text.trim();
    if (!primary) {
        return 'I could not generate a complete answer from the local model for this question.';
    }

    // Keep fallback concise for widget UX.
    return primary.length > 320 ? `${primary.slice(0, 320)}...` : primary;
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

        self.postMessage({ status: 'embedder-status', data: { state: 'loading', text: 'Loading semantic retriever (all-MiniLM)...' } });
        await ensureContextCache(context);

        if (AI.embedderUnavailable && !AI.embedderFallbackAnnounced) {
            self.postMessage({ status: 'retrieval-mode', mode: 'keyword-only' });
            AI.embedderFallbackAnnounced = true;
        }

        self.postMessage({
            status: 'embedder-status',
            data: AI.embedderUnavailable
                ? { state: 'unavailable', text: 'Semantic retriever unavailable, using keyword-only retrieval.' }
                : { state: 'ready', text: 'Semantic retriever ready.' },
        });

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
                    "Answer ONLY what the user asked for.",
                    "Do not require unrelated details (for example names, domains, or versions) unless the user explicitly asks for them.",
                    "If and only if the requested fact is truly missing from all provided chunks, say you do not have enough information.",
                    "Do not invent links, tools, versions, names, or facts.",
                    "Keep answers concise and factual.",
                    "End the answer with a citations line in this format: Sources: [chunk-id], [chunk-id]",
                ].join(' ')
            },
            { 
                role: "user" as const, 
                content: [
                    `Context:\n${relevantContext}`,
                    `Question: ${text}`,
                    'Instruction:',
                    '- Provide a direct answer to the question first.',
                    '- If the question asks for a list (for example tech stack), list the items found in context.',
                    '- Do not add commentary about missing unrelated fields.',
                    '- Only mention insufficient information if the asked fact itself is not present.',
                ].join('\n\n')
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

        const modelRawAnswer = fullResponse.trim();
        const baseAnswer = stripSourcesLine(modelRawAnswer);
        const sourcesLine = citations.length > 0
            ? `Sources: ${citations.map((id) => `[${id}]`).join(', ')}`
            : '';
        const groundedAnswer = baseAnswer || buildGroundedFallbackFromChunks(relevantChunks);
        const answerWithSources = sourcesLine
            ? `${groundedAnswer}\n\n${sourcesLine}`
            : groundedAnswer;
        const retrievalMode = AI.embedderUnavailable ? 'keyword-only' : 'hybrid';
        const debugLine = SHOW_DEBUG_INFO
            ? `\n\n[debug] retrieval=${retrievalMode}, confidence=${retrieval.topScore.toFixed(2)}`
            : '';
        const finalAnswer = `${answerWithSources}${debugLine}`;

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
