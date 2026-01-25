import { pipeline, env } from '@xenova/transformers';

// Configuration
env.allowLocalModels = false;
env.useBrowserCache = true;

const GENERATION_MODEL = 'Xenova/Qwen1.5-0.5B-Chat';
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

interface ContextChunk {
    id: string;
    keywords: string[];
    text: string;
}

class AI {
    static textGenPipeline: any = null;
    static embedderPipeline: any = null;

    static async getGenerator(progress_callback: any = null) {
        if (!this.textGenPipeline) {
            this.textGenPipeline = await pipeline('text-generation', GENERATION_MODEL, { 
                progress_callback 
            });
        }
        return this.textGenPipeline;
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

        if (bestSemScore > 0.15) {
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
        const generator = await AI.getGenerator((data: any) => {
            self.postMessage({ status: 'progress', data });
        });

        self.postMessage({ status: 'ready' });

        const relevantFact = await findMostRelevantChunk(text, context);
        let fullPrompt = "";
        
        if (relevantFact === "NO_RELEVANT_CONTEXT_FOUND") {
             self.postMessage({ status: 'update', output: "I can mostly answer questions about the tech stack, hosting, architecture, and tools used in this portfolio." });
             self.postMessage({ status: 'complete', output: "I can mostly answer questions about the tech stack, hosting, architecture, and tools used in this portfolio." });
             return;
        }

        fullPrompt = `<|im_start|>system
You are the Databro assistant. You are helpful and brief.
<|im_end|>
<|im_start|>user
Context: "${relevantFact}"

Question: ${text}

Instruction: Answer the question using ONLY the provided Context. List specific tools, services, or links if mentioned.
<|im_end|>
<|im_start|>assistant
`;

        const output = await generator(fullPrompt, {
            max_new_tokens: 80,
            do_sample: false,     
            temperature: 0.01,    
            repetition_penalty: 1.0,
            return_full_text: false,
            callback_function: (beams: any[]) => {
                try {
                   const decoded = generator.tokenizer.decode(beams[0].output_token_ids, { skip_special_tokens: true });
                   if (decoded.trim().length > 0) {
                       self.postMessage({ status: 'update', output: decoded.trim() });
                   }
                } catch(e) {}
            }
        });

        let finalResponse = "";
        if (output && output.length > 0) {
            finalResponse = output[0].generated_text;
        }
        self.postMessage({ status: 'complete', output: finalResponse.trim() });

    } catch (err: any) {
        console.error("Worker Critical Error:", err);
        self.postMessage({ status: 'error', error: err.message || "Unknown AI Error" });
    }
});
