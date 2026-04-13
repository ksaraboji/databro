# AI Chat Retrieval Primer 101

This document explains how the Databro AI chat retrieval system works end-to-end.

It is intended for junior developers who need to understand, debug, and tune the local browser RAG pipeline.

## 1) Big Picture

The chatbot runs fully in the browser and uses a 3-stage retrieval + generation flow:

1. Dense + sparse retrieval over KB chunks
2. Cross-encoder re-ranking
3. Grounded answer generation from selected chunks

No server-side inference is required for this path.

## 2) Models Used

Current models in production:

1. Generation model:
- Llama-3.2-1B-Instruct-q4f16_1-MLC (WebLLM)
- In code: `GENERATION_MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC"`

2. Embedding model (dense retrieval):
- Xenova/all-MiniLM-L6-v2
- In code: `KB_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'`

3. Re-ranker model (cross-encoder style scoring):
- Xenova/mMiniLMv2-L12-H384-uncased
- Loaded via transformers.js `zero-shot-classification` pipeline

## 2.1) Where Models Are Downloaded From

The runtime pulls model artifacts from remote registries the first time, then reuses browser cache.

1. Generation model files (WebLLM):
- Model weights/source path:
  - `https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/resolve/main/`
- WebGPU runtime library (WASM):
  - `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`

2. Embedding model (transformers.js):
- `Xenova/all-MiniLM-L6-v2`
- Resolved and downloaded via Hugging Face Hub through `@xenova/transformers`

3. Re-ranker model (transformers.js):
- `Xenova/mMiniLMv2-L12-H384-uncased`
- Resolved and downloaded via Hugging Face Hub through `@xenova/transformers`

4. Browser-side cache behavior:
- `env.useBrowserCache = true` is enabled in worker
- First run downloads artifacts, later runs generally reuse local browser cache

## 2.2) What WASM Is and Why It Matters Here

WASM (WebAssembly) is a low-level binary format that runs in the browser at near-native speed.

Why it is used in this stack:

1. WebLLM runtime is delivered as a `.wasm` module for efficient on-device inference.
2. ONNX Runtime Web uses WASM/WebGPU backends for transformer execution in-browser.
3. Running these compute-heavy paths in WASM enables local inference without server round trips.

In this implementation specifically:

1. Worker sets ONNX WASM path explicitly to `/ort/` to avoid web worker path resolution issues.
2. Worker sets ONNX threads to `1` for stable behavior in browser worker execution.

## 3) Retrieval Configuration (Current)

Defined in `RETRIEVAL_CONFIG`:

1. `topK = 3`
- Final number of chunks used to build model context

2. `topKHybridRetrieve = 24`
- Candidate pool size after dense+sparse scoring

3. `topKReRank = 12`
- Number of top candidates re-ranked by MiniLM cross-encoder

4. `semanticWeight = 0.52`
- Weight for dense cosine similarity

5. `sparseWeight = 0.43`
- Weight for BM25 sparse score

6. Confidence gate:
- `minConfidence = 0.28`
- `minMeanTop3 = 0.22`

## 4) Knowledge Base and Vector Artifact

Source of truth:

1. Markdown KB:
- `public/ai-chat/knowledge-base.md`

2. Parsed chunk artifact with embeddings:
- `public/ai-chat/knowledge-base-vectors.json`

3. Versioning:
- `KB_VERSION` in `components/ai-chat/rag-kb.ts`
- Current value at time of writing: `2026-04-11.19`

4. Chunking defaults:
- `chunkSize = 520`
- `overlap = 100`

A KB edit should be followed by:

1. Bump `KB_VERSION`
2. Rebuild vectors (`node scripts/build-kb-vectors.mjs`)

## 4.1) KB Pre-Caching (What It Means in This Project)

In this codebase, KB pre-caching happens at two layers: build-time and runtime.

Build-time pre-caching (recommended path):

1. Convert markdown KB into chunk embeddings ahead of time.
2. Store result in `public/ai-chat/knowledge-base-vectors.json`.
3. Ship this file with the app so the browser can fetch ready-to-use vectors.

Why this matters:

1. Avoids expensive embedding generation on first user query.
2. Reduces first-answer latency.
3. Ensures deterministic retrieval behavior for a given `KB_VERSION`.

Runtime warm cache (client side):

1. Widget loads KB artifact on startup via `useEffect`.
2. It first attempts to fetch `knowledge-base-vectors.json`.
3. If artifact header matches `KB_VERSION` and `KB_EMBEDDING_MODEL`, widget stores it in `ragContextJSON`.
4. If artifact is missing or incompatible, widget falls back to markdown parsing in browser.

Worker-side cache behavior:

1. Worker receives `ragContextJSON` in each request.
2. Worker uses `contextHash` to skip rebuilding cache when context is unchanged.
3. `cachedChunks` keeps chunk vectors in memory for subsequent prompts.
4. If vectors are already present and compatible, worker reuses them directly.

Important distinction:

1. Model caching (`env.useBrowserCache = true`) is for model artifacts.
2. KB pre-caching is separate and is driven by `knowledge-base-vectors.json` + in-memory worker cache.

Practical workflow after KB edits:

1. Update KB markdown.
2. Bump `KB_VERSION`.
3. Rebuild vector artifact.
4. Refresh app so widget picks up the new artifact.

## 5) End-to-End Data Flow

## 5.1 Worker Startup and Model Lifecycle

1. Widget creates worker lazily when chat is first opened:
- `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`

2. On each user question, widget sends this payload to worker:
- `text`: user question
- `context`: serialized KB context JSON (`ragContextJSON`)

3. Worker does not receive model objects from the widget.
- The worker owns model initialization and loading using internal constants and loaders.

4. Worker model loading order during request handling:
- `getLLMEngine(...)` for generation model (WebLLM)
- `ensureContextCache(...)` for chunk embedding availability
- `getEmbedder()` for dense query embedding
- `getReRanker()` for cross-encoder re-ranking

5. Lazy-load pattern:
- Each model/pipeline is initialized once and reused via static singleton fields in `AI` class.
- Failures trigger cooldown-based retry (`embedderRetryCooldownMs`, `reRankerRetryCooldownMs`).

6. Fallback behavior:
- If embedder unavailable: retrieval mode becomes sparse-only (BM25).
- If re-ranker unavailable: retrieval continues using dense+sparse hybrid order.

## 5.2 KB Cache Build

1. Worker receives context JSON from widget.
2. If vector artifact header matches (`kbVersion` + `embeddingModel`), precomputed vectors are reused.
3. Otherwise, embeddings are computed in-browser and cached.

## 5.3 Stage A: Hybrid Retrieval

For each chunk:

1. Dense score:
- Query embedding vs chunk embedding cosine similarity
- Cosine is normalized from [-1, 1] to [0, 1]

2. Sparse score:
- BM25 score on query vs chunk text
- BM25 parameters:
  - `k1 = 1.5`
  - `b = 0.75`

3. Weighted fusion:
- `final = semanticWeight * semantic + sparseWeight * sparse`

4. Top pool:
- Sort descending by `final`
- Keep top 24 candidates

## 5.4 Stage B: Re-ranking

1. Re-ranker loads `Xenova/mMiniLMv2-L12-H384-uncased`.
2. For top 12 candidates:
- Build pair as: `"<query> [SEP] <chunkText>"`
- Chunk text truncated to first 512 characters
- Score relevance in [0, 1]

3. Reorder candidates by re-rank score.
4. Keep best 3 chunks for final context assembly.

If re-ranker fails:

1. Retrieval falls back to hybrid order.

## 5.5 Stage C: Confidence Gate

The selected candidates pass when either:

1. `topScore >= 0.34`, or
2. `topScore >= 0.28` and `meanTop3 >= 0.22`

If confidence fails:

1. Worker returns a grounded fallback response.

## 5.6 Stage D: Context Assembly and Generation

1. Context text is built from top chunks with chunk IDs.
2. Max context budget is 2200 characters.
3. LLM receives:
- System grounding rules
- User question
- Retrieved context

Generation defaults:

1. `temperature = 0.1`
2. `max_tokens = 130`

## 6) Citation Logic

1. Citation IDs are chunk IDs selected during context assembly.
2. Worker sends citations separately from answer text.
3. UI renders citation chips and preview snippets by chunk ID.

Important:

1. The model is instructed not to print citation lines directly.
2. Citation rendering is handled by the widget, not the model answer text.

## 7) Guardrails Against Hallucination

Current guardrail strategy is intentionally minimal and generic:

1. Use only provided context chunks.
2. Answer only the asked question.
3. Prefer one best chunk for direct fact questions.
4. Copy literal values exactly (URL/version/model/ID).
5. If context is missing or conflicting, say insufficient information.
6. Do not invent facts.

This avoids intent-specific custom code while improving factual precision.

## 8) Fallback Modes

1. Embedder unavailable:
- Retrieval mode becomes sparse-only (BM25)

2. Re-ranker unavailable:
- Continue with dense+sparse hybrid order

3. Low retrieval confidence:
- Return fallback answer with debug confidence

## 9) Tuning Guide (Safe Order)

When quality drops, tune in this order:

1. KB quality
- Remove overlap/duplication
- Keep canonical factual phrasing

2. Chunking
- Adjust chunk size/overlap if facts are split poorly

3. Retrieval weights
- Adjust semantic vs sparse weights

4. Candidate depths
- Tune `topKHybridRetrieve` and `topKReRank`

5. Prompt guardrails
- Keep minimal and generic

Avoid:

1. Intent-specific branch logic in worker
2. Large instruction blocks in KB
3. Duplicate contradictory facts

## 10) Debugging Checklist

For a bad answer, verify in order:

1. Are expected chunks cited?
2. Is `kbVersion` current between code and vector artifact?
3. Did vector rebuild run after KB edits?
4. Is retrieval mode `hybrid` or `sparse-only`?
5. Is confidence too low?
6. Is the exact literal fact present in any retrieved chunk?

## 11) Key Files

Core implementation files:

1. `components/ai-chat/worker.ts`
- Retrieval, re-ranking, confidence gate, generation orchestration

2. `components/ai-chat/rag-kb.ts`
- KB parsing/chunking, versioning, artifact interfaces

3. `public/ai-chat/knowledge-base.md`
- Human-authored factual KB source

4. `public/ai-chat/knowledge-base-vectors.json`
- Generated chunk + embedding artifact

5. `scripts/build-kb-vectors.mjs`
- KB embedding build pipeline

## 12) One-Command Rebuild

Use this after KB edits:

```bash
cd /home/mechianz/databro
node scripts/build-kb-vectors.mjs
```

Then verify the artifact header contains the latest `kbVersion`.
