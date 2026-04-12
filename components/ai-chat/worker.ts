import { pipeline, env } from '@xenova/transformers';
import { CreateMLCEngine, MLCEngine } from "@mlc-ai/web-llm";
import { KB_EMBEDDING_MODEL, KB_VERSION } from './rag-kb';

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
const EMBEDDING_MODEL = KB_EMBEDDING_MODEL;
const SHOW_DEBUG_INFO = process.env.NODE_ENV !== 'production';

interface ContextPayloadHeader {
    kbVersion?: string;
    embeddingModel?: string;
    generatedAt?: string;
    source?: string;
    chunkSize?: number;
    overlap?: number;
    dimensions?: number;
}

interface ContextPayload {
    header?: ContextPayloadHeader;
    chunks: ContextChunk[];
}

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
    embedding?: number[];
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
    topKHybridRetrieve: number;  // top candidates after dense + sparse hybrid scoring
    topKReRank: number;           // top candidates to re-rank with cross-encoder
    semanticWeight: number;
    sparseWeight: number;
    minConfidence: number;
    minMeanTop3: number;
}

interface ScoredCandidate {
    chunk: CachedChunk;
    semantic: number;
    sparse: number;
    final: number;
    reRankScore?: number;
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
    topK: 3,
    topKHybridRetrieve: 24,       // accuracy-first: retrieve a wider pool before re-ranking
    topKReRank: 12,               // accuracy-first: re-rank more candidates
    semanticWeight: 0.52,
    sparseWeight: 0.43,
    minConfidence: 0.33,
    minMeanTop3: 0.26,
};

const STREAM_UPDATE_MIN_INTERVAL_MS = 48;
const STREAM_UPDATE_MIN_CHARS = 18;

class AI {
    static llmEngine: MLCEngine | null = null;
    static embedderPipeline: unknown = null;
    static reRankerPipeline: unknown = null;
    static embedderUnavailable = false;
    static reRankerUnavailable = false;
    static embedderFallbackAnnounced = false;
    static embedderLastFailureAt = 0;
    static reRankerLastFailureAt = 0;
    static readonly embedderRetryCooldownMs = 12000;
    static readonly reRankerRetryCooldownMs = 12000;
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
                console.warn('Embedding backend unavailable. Falling back to sparse-only retrieval.', error);
                this.embedderUnavailable = true;
                this.embedderLastFailureAt = Date.now();
                this.embedderPipeline = null;
                return null;
            }
        }
        return this.embedderPipeline;
    }

    static async getReRanker() {
        if (this.reRankerUnavailable) {
            const elapsed = Date.now() - this.reRankerLastFailureAt;
            if (elapsed < this.reRankerRetryCooldownMs) {
                return null;
            }
            // Retry after cooldown
            this.reRankerUnavailable = false;
        }
        if (!this.reRankerPipeline) {
            try {
                // MiniLM cross-encoder model for re-ranking
                this.reRankerPipeline = await pipeline(
                    'zero-shot-classification',
                    'Xenova/mMiniLMv2-L12-H384-uncased'
                );
                return this.reRankerPipeline;
            } catch (error) {
                console.warn('Re-ranker model unavailable. Using hybrid (dense+sparse) retrieval only.', error);
                this.reRankerUnavailable = true;
                this.reRankerLastFailureAt = Date.now();
                this.reRankerPipeline = null;
                return null;
            }
        }
        return this.reRankerPipeline;
    }
}

function hashString(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 33) ^ input.charCodeAt(i);
    }
    return String(hash >>> 0);
}

/**
 * Lightweight BM25 implementation for term frequency ranking.
 * Scores documents based on query term frequency and inverse document frequency.
 */
class BM25 {
    k1 = 1.5;  // tuning parameter (term frequency saturation)
    b = 0.75;  // tuning parameter (field length normalization)
    idf: Map<string, number> = new Map();
    avgDocLen = 0;

    constructor(documents: string[]) {
        // Compute IDF for all terms across documents
        const termDocFreq = new Map<string, number>();
        let totalLen = 0;

        for (const doc of documents) {
            const terms = this.tokenize(doc);
            const uniqueTerms = new Set(terms);
            for (const term of Array.from(uniqueTerms)) {
                termDocFreq.set(term, (termDocFreq.get(term) || 0) + 1);
            }
            totalLen += terms.length;
        }

        this.avgDocLen = documents.length > 0 ? totalLen / documents.length : 0;

        // Calculate IDF: log((N - df + 0.5) / (df + 0.5))
        const N = documents.length;
        for (const [term, df] of Array.from(termDocFreq.entries())) {
            this.idf.set(term, Math.log((N - df + 0.5) / (df + 0.5)));
        }
    }

    private tokenize(text: string): string[] {
        return text.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 1);
    }

    score(query: string, document: string): number {
        const queryTerms = this.tokenize(query);
        const docTerms = this.tokenize(document);
        const docLen = docTerms.length;

        let score = 0;
        const termFreq = new Map<string, number>();

        // Count term frequencies in document
        for (const term of docTerms) {
            termFreq.set(term, (termFreq.get(term) || 0) + 1);
        }

        // BM25 formula
        for (const term of queryTerms) {
            const tf = termFreq.get(term) || 0;
            const idf = this.idf.get(term) || 0;
            const numerator = tf * (this.k1 + 1);
            const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLen));
            score += idf * (numerator / denominator);
        }

        // Normalize to [0, 1]
        return Math.min(score / (100 + score), 1);
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

function normalizeChunks(contextJSON: string): ContextChunk[] {
    try {
        const parsed = JSON.parse(contextJSON);
        const payload: ContextPayload = Array.isArray(parsed)
            ? { chunks: parsed }
            : {
                header: parsed?.header,
                chunks: Array.isArray(parsed?.chunks) ? parsed.chunks : [],
            };
        if (!Array.isArray(payload.chunks)) return [];

        return payload.chunks
            .filter((chunk) => chunk && typeof chunk.text === 'string' && chunk.text.trim().length > 0)
            .map((chunk, idx) => ({
                id: typeof chunk.id === 'string' && chunk.id.trim().length > 0 ? chunk.id : `chunk-${idx + 1}`,
                keywords: Array.isArray(chunk.keywords)
                    ? chunk.keywords.filter((k: unknown) => typeof k === 'string')
                    : [],
                text: chunk.text,
                embedding: Array.isArray(chunk.embedding)
                    ? chunk.embedding.filter((v: unknown) => typeof v === 'number')
                    : undefined,
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

function parseContextHeader(contextJSON: string): ContextPayloadHeader | null {
    try {
        const parsed = JSON.parse(contextJSON);
        if (Array.isArray(parsed)) return null;
        return parsed?.header ?? null;
    } catch {
        return null;
    }
}

function canUsePrecomputedEmbeddings(header: ContextPayloadHeader | null, chunks: ContextChunk[]): boolean {
    if (!header) return false;
    if (header.kbVersion !== KB_VERSION) return false;
    if (header.embeddingModel !== EMBEDDING_MODEL) return false;
    return chunks.every((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length > 0);
}

async function ensureContextCache(contextJSON: string): Promise<void> {
    const incomingHash = hashString(contextJSON);
    const hasEmbeddedVectors = AI.cachedChunks.some((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length > 0);
    if (AI.contextHash === incomingHash && AI.cachedChunks.length > 0 && hasEmbeddedVectors) {
        return;
    }

    const chunks = normalizeChunks(contextJSON);
    const header = parseContextHeader(contextJSON);
    if (chunks.length === 0) {
        AI.cachedChunks = [];
        AI.contextHash = incomingHash;
        return;
    }

    if (canUsePrecomputedEmbeddings(header, chunks)) {
        AI.cachedChunks = chunks.map((chunk) => ({
            ...chunk,
            embedding: chunk.embedding ?? null,
        }));
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

function calculateMeanTop3(candidates: ScoredCandidate[]): number {
    const top3 = candidates.slice(0, 3);
    if (top3.length === 0) return 0;
    const sum = top3.reduce((acc, item) => acc + item.final, 0);
    return sum / top3.length;
}

function passesConfidenceGate(topScore: number, meanTop3: number, cfg: RetrievalConfig): boolean {
    if (topScore >= cfg.minConfidence && meanTop3 >= cfg.minMeanTop3) return true;
    return false;
}

async function findMostRelevantChunks(query: string, cfg: RetrievalConfig): Promise<RetrievalResult> {
    if (AI.cachedChunks.length === 0) return { chunks: [], topScore: 0, meanTop3: 0 };

    try {
        // ===== PHASE 1: Dense + Sparse Hybrid Retrieval =====
        const embedder = await AI.getEmbedder();
        let queryVec: number[] | null = null;

        if (embedder) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const queryOut = await (embedder as any)(query, { pooling: 'mean', normalize: true });
            queryVec = Array.from(queryOut.data as Float32Array);
        }

        // Initialize BM25 with all chunk texts (for sparse scoring)
        const chunkTexts = AI.cachedChunks.map(c => `${c.keywords.join(' ')} ${c.text}`);
        const bm25 = new BM25(chunkTexts);

        // Score all chunks with hybrid dense + sparse retrieval.
        const scored: ScoredCandidate[] = AI.cachedChunks.map((chunk, idx) => {
            // Dense (semantic) score
            const semanticRaw = queryVec && chunk.embedding ? cosineSimilarity(queryVec, chunk.embedding) : 0;
            const semantic = queryVec && chunk.embedding ? Math.max(0, Math.min(1, (semanticRaw + 1) / 2)) : 0;

            // Sparse (BM25) score
            const sparse = bm25.score(query, chunkTexts[idx]);

            // Combine dense and sparse signals before re-ranking.
            const semanticWeight = queryVec ? cfg.semanticWeight : 0;
            const sparseWeight = cfg.sparseWeight;

            return {
                chunk,
                semantic,
                sparse,
                final: (semanticWeight * semantic) + (sparseWeight * sparse),
            };
        });

        // Get top-K candidates for hybrid retrieval (before re-ranking)
        const hybridCandidates = scored
            .sort((a, b) => b.final - a.final)
            .slice(0, cfg.topKHybridRetrieve);

        if (hybridCandidates.length === 0) return { chunks: [], topScore: 0, meanTop3: 0 };

        // ===== PHASE 2: Re-ranking with Cross-Encoder =====
        let reRankCandidates = hybridCandidates;

        const reRanker = await AI.getReRanker();
        const reRankCount = Math.min(cfg.topKReRank, hybridCandidates.length);
        if (reRanker && reRankCount > 0) {
            try {
                // For each of the top-K candidates, compute re-rank score
                for (const candidate of hybridCandidates.slice(0, reRankCount)) {
                    const chunkText = candidate.chunk.text.substring(0, 512); // Limit input length
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const reRankResult = await (reRanker as any)(`${query} [SEP] ${chunkText}`, ['relevant', 'irrelevant'], {
                            hypothesis_template: "This text is {}.",
                        });

                        // Extract relevance score from classification output
                        const relevantScore = reRankResult.scores?.[0] ?? 0;
                        candidate.reRankScore = Math.max(0, Math.min(1, relevantScore));
                    } catch (err) {
                        console.warn('Re-ranker inference error for chunk, skipping re-rank for this chunk', err);
                        candidate.reRankScore = candidate.final; // Fallback to hybrid score
                    }
                }

                // Re-sort by re-rank scores
                reRankCandidates = hybridCandidates.slice(0, reRankCount)
                    .sort((a, b) => (b.reRankScore ?? b.final) - (a.reRankScore ?? a.final))
                    .concat(hybridCandidates.slice(reRankCount)); // Keep remaining candidates in original order
            } catch (err) {
                console.warn('Re-ranker initialization failed, using hybrid scores only', err);
                // Fall back to hybrid scoring
            }
        }

        const topScore = reRankCandidates[0].reRankScore ?? reRankCandidates[0].final;
        const meanTop3 = calculateMeanTop3(reRankCandidates);

        if (!passesConfidenceGate(topScore, meanTop3, cfg)) {
            return { chunks: [], topScore, meanTop3 };
        }

        return {
            chunks: reRankCandidates.slice(0, cfg.topK).map((c) => c.chunk),
            topScore,
            meanTop3,
        };
    } catch (err) {
        console.error('Retrieval error:', err);
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
    // Remove citation-only lines from model output; citations are shown by UI chips.
    // Covers both "Sources: [...]" and standalone "[id]" lines.
    return text
        .replace(/\n*\s*Sources:\s*(?:\[(?:chunk:)?[^\]]+\](?:,\s*)?)+\s*\n?/gi, '\n')
        .replace(/^\s*\[(?:chunk:)?[^\]]+\]\s*$/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Returns the set of non-trivial words from a text segment. */
function meaningfulWords(text: string): Set<string> {
    const STOP = new Set([
        'a','an','the','is','are','was','were','be','been','being',
        'of','in','on','at','to','for','with','and','or','but','it','its',
        'this','that','by','as','from','not','has','have','had','does',
        'do','did','can','will','would','could','should','may','might','also',
    ]);
    return new Set(
        text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w))
    );
}

/**
 * Remove near-duplicate sentences or bullet lines.
 * Two segments are considered duplicates when they share ≥55% of meaningful words.
 */
function dedupeRepeatingSentences(text: string): string {
    if (!text) return text;
    // Split on newlines or sentence-ending punctuation followed by a capital letter.
    // Lookbehind avoids splitting on URLs (domain dots are not followed by capital letters).
    const segments = text.split(/\n|(?<=[.!?])\s+(?=[A-Z\-])/);
    const kept: string[] = [];
    for (const seg of segments) {
        const trimmed = seg.trim();
        if (!trimmed) continue;
        const words = meaningfulWords(trimmed);
        const isDupe = words.size > 1 && kept.some(k => {
            const kw = meaningfulWords(k);
            if (!kw.size) return false;
            const shared = Array.from(words).filter(w => kw.has(w)).length;
            return shared / Math.max(kw.size, words.size) >= 0.55;
        });
        if (!isDupe) kept.push(trimmed);
    }
    return kept.join('\n').replace(/\n{3,}/g, '\n').trim();
}

function removeDanglingTrailingBullet(text: string): string {
    if (!text) return text;

    const lines = text.split('\n');
    const bulletRegex = /^\s*(?:[-*•]|\d+\.)\s+/;

    while (lines.length > 0) {
        const last = lines[lines.length - 1].trim();
        if (!last) {
            lines.pop();
            continue;
        }

        // Drop incomplete trailing bullets like "- Additional cloud services used:"
        if (bulletRegex.test(last) && /[:;,\-]$/.test(last)) {
            lines.pop();
            continue;
        }

        break;
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Remove trailing hedging/fallback phrases ("Lack of information.", "I don't have...", etc.)
 * when a substantive answer already exists before them.
 */
/**
 * Convert bullet/dash formatted output into flowing prose.
 */
function bulletsToProse(text: string): string {
    if (!text) return text;

    // Multi-line bullets: collect consecutive bullet lines, join into a sentence
    const lines = text.split('\n');
    const bulletRegex = /^\s*[-•*]\s+(.*)/;
    const result: string[] = [];
    let bulletGroup: string[] = [];

    const flushBullets = () => {
        if (!bulletGroup.length) return;
        if (bulletGroup.length === 1) {
            result.push(bulletGroup[0]);
        } else {
            const last = bulletGroup.pop()!;
            result.push(bulletGroup.join(', ') + ', and ' + last + '.');
        }
        bulletGroup = [];
    };

    for (const line of lines) {
        const m = line.match(bulletRegex);
        if (m) {
            bulletGroup.push(m[1].trim().replace(/\.+$/, ''));
        } else {
            flushBullets();
            result.push(line);
        }
    }
    flushBullets();

    // Also collapse inline "text: - A - B - C" patterns
    const joined = result.join(' ').replace(/\s{2,}/g, ' ').replace(/ \./g, '.').trim();
    return joined.replace(/([:,])\s*([-•*]\s+)([^.!?\n]+?)(?=\s+[-•*]\s+|$)/g, (_m, colon, _dash, item) => `${colon} ${item}`);
}

/** Remove section-heading artifacts and malformed label fragments from generated prose. */
function cleanupLabelArtifacts(text: string): string {
    if (!text) return text;

    return text
        // Drop repeated heading-like phrases that often leak from context chunks.
        .replace(/\b(?:Frontend and backend tech stack|Important libraries by tool and module|Directory for AWS and Azure infra|Infrastructure and tooling languages\/formats)\s*:\s*,?/gi, '')
        // Clean accidental double punctuation and spacing.
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+,/g, ',')
        .replace(/,{2,}/g, ',')
        .trim();
}

function stripTrailingHedge(text: string): string {
    if (!text) return text;
    const HEDGE_PATTERNS = [
        /^lack of information\.?$/i,
        /^i (don['']t|do not) have (enough )?information/i,
        /^i (couldn['']t|could not|can['']t|cannot) find/i,
        /^no (additional )?information (is )?available/i,
        /^insufficient information\.?$/i,
        /^i (am|'m) not sure/i,
        /^this information is not available/i,
        /^i don['']t know/i,
    ];
    const lines = text.split('\n');
    // Remove trailing lines that match hedging patterns, but only if content precedes them.
    while (lines.length > 1) {
        const last = lines[lines.length - 1].trim();
        if (!last || HEDGE_PATTERNS.some(p => p.test(last))) {
            lines.pop();
        } else {
            break;
        }
    }
    return lines.join('\n').trim();
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
    const { text, context } = event.data as {
        text: string;
        context: string;
    };

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
            self.postMessage({ status: 'retrieval-mode', mode: 'sparse-only' });
            AI.embedderFallbackAnnounced = true;
        }

        self.postMessage({
            status: 'embedder-status',
            data: AI.embedderUnavailable
                ? { state: 'unavailable', text: 'Semantic retriever unavailable, using sparse (BM25) retrieval only.' }
                : { state: 'ready', text: 'Semantic retriever ready.' },
        });

        // Load re-ranker model (cross-encoder for relevance scoring)
        self.postMessage({ status: 'reranker-status', data: { state: 'loading', text: 'Loading re-ranker (MiniLM cross-encoder)...' } });
        const reRanker = await AI.getReRanker();
        self.postMessage({
            status: 'reranker-status',
            data: reRanker && !AI.reRankerUnavailable
                ? { state: 'ready', text: 'Re-ranker ready.' }
                : { state: 'unavailable', text: 'Re-ranker unavailable, using dense+sparse retrieval only.' },
        });

        self.postMessage({ status: 'ready' });

        const retrieval = await findMostRelevantChunks(text, RETRIEVAL_CONFIG);
        const relevantChunks = retrieval.chunks;

        const contextAssembly = buildContextText(relevantChunks);
        const relevantContext = contextAssembly.contextText;
        const citations = contextAssembly.citations;
        
        if (!relevantContext) {
            const fallback = retrieval.topScore > 0
                ? 'I do not have enough grounded information in this portfolio knowledge base to answer that question.'
                : "I can mostly answer questions about the tech stack, hosting, architecture, and tools used in this portfolio.";
            const retrievalMode = AI.embedderUnavailable ? 'sparse-only' : 'hybrid';
            const reRankStatus = AI.reRankerUnavailable ? '' : '+rerank';
            const debugLine = SHOW_DEBUG_INFO
                ? `\n\n[debug] source=fallback, retrieval=${retrievalMode}${reRankStatus}, confidence=${retrieval.topScore.toFixed(2)}`
                : '';
            const finalFallback = `${fallback}${debugLine}`;
             self.postMessage({ status: 'update', output: finalFallback });
             self.postMessage({ status: 'complete', output: finalFallback });
             return;
        }

        const messages = [
            {
                role: "system" as const,
                content: [
                    "You answer only from the provided context chunks.",
                    "If the answer exists in context, return it directly and copy literal values exactly.",
                    "If the answer does not exist in context, reply exactly: I do not have enough information in this portfolio knowledge base to answer that question.",
                    "For URL questions, return only the exact URL.",
                    "For list questions, return a concise comma-separated list.",
                    "For descriptive questions (for example where/how/what/who), return a complete factual sentence from context, not a single-word fragment.",
                    "Return only the final answer text.",
                    "Do not include labels like Question:, Answer:, Context:, or Explanation:.",
                    "Do not add citations in the answer.",
                ].filter(Boolean).join(' ')
            },
            {
                role: "user" as const,
                content: [
                    `Context:\n${relevantContext}`,
                    `Question: ${text}`,
                    'Instruction: Return only the answer text for this one question, with no prefixes or extra sections. Use a complete sentence unless the question asks for a URL or list.',
                ].filter(Boolean).join('\n\n')
            }
        ];

        const completion = await engine.chat.completions.create({
            messages,
            stream: true,
            temperature: 0.0, // Deterministic factual answers
            max_tokens: 130,  // Cap at ~1 prose sentence
        });

        let fullResponse = "";
        let pendingSinceFlush = 0;
        let lastFlushAt = 0;

        const flushStreamUpdate = (force = false) => {
            const now = Date.now();
            const intervalElapsed = now - lastFlushAt >= STREAM_UPDATE_MIN_INTERVAL_MS;
            const enoughChars = pendingSinceFlush >= STREAM_UPDATE_MIN_CHARS;
            if (!force && !intervalElapsed && !enoughChars) return;
            self.postMessage({ status: 'update', output: fullResponse });
            lastFlushAt = now;
            pendingSinceFlush = 0;
        };

        for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta.content || "";
            if (delta) {
                fullResponse += delta;
                pendingSinceFlush += delta.length;
                // Flush quicker at natural boundaries so the stream still feels live.
                const hasBoundary = /[\n.!?]$/.test(delta);
                flushStreamUpdate(hasBoundary);
            }
        }

        flushStreamUpdate(true);

        const modelRawAnswer = fullResponse.trim();
        const baseAnswer = cleanupLabelArtifacts(stripTrailingHedge(removeDanglingTrailingBullet(
            dedupeRepeatingSentences(bulletsToProse(stripSourcesLine(modelRawAnswer))),
        )));
        const groundedAnswer = baseAnswer || buildGroundedFallbackFromChunks(relevantChunks);
        const retrievalMode = AI.embedderUnavailable ? 'sparse-only' : 'hybrid';
        const debugLine = SHOW_DEBUG_INFO
            ? `\n\n[debug] source=rag, retrieval=${retrievalMode}, confidence=${retrieval.topScore.toFixed(2)}`
            : '';
        const finalAnswer = `${groundedAnswer}${debugLine}`;

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
