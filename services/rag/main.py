import os
import faiss
import numpy as np
import duckdb
import json
from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from typing import List, Optional
from sentence_transformers import SentenceTransformer

app = FastAPI(title="RAG Service", version="1.1")

# --- Configuration ---
MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384  # Dimension for all-MiniLM-L6-v2
CHUNK_SIZE = 512     # Characters per chunk (approx 100-150 words)
CHUNK_OVERLAP = 50   # Overlap to maintain context between chunks
DB_PATH = "rag_data.duckdb" # Local persistence file

print(f"Loading embedding model: {MODEL_NAME}...")
model = SentenceTransformer(MODEL_NAME)
print("Model loaded.")

# --- DuckDB Setup ---
# We use DuckDB for Persistence and FTS
con = duckdb.connect(DB_PATH)

# Initialize schema
con.execute("""
    CREATE SEQUENCE IF NOT EXISTS seq_doc_id START 0;
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY DEFAULT nextval('seq_doc_id'),
        text VARCHAR,
        metadata JSON
    );
""")
# Create FTS index (Simplified for this environment. 
# Note: DuckDB FTS might require rebuilding on inserts, 
# so for high-throughput we might just do standard LIKE queries or rebuild periodically.
# Here we try to enable it.)
try:
    con.execute("INSTALL fts; LOAD fts;")
    con.execute("PRAGMA create_fts_index('documents', 'id', 'text');")
    print("DuckDB FTS initialized.")
except Exception as e:
    print(f"Warning: FTS init failed (might be already existing): {e}")

# --- Helper Functions ---
def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """
    Splits text into smaller overlapping chunks.
    Simple character-based splitter. Ideally use recursive token splitter for prod.
    """
    if not text:
        return []
        
    chunks = []
    start = 0
    text_len = len(text)
    
    while start < text_len:
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap # Move forward, but back up by overlap amount
        
    return chunks

# --- FAISS Initialization ---
# Simple Flat L2 index for exact search
index = faiss.IndexFlatL2(EMBEDDING_DIM)
# Rebuild FAISS from DuckDB on startup if needed
# (Skipped for MVP speed, assuming empty start or persistence handled elsewhere)
print("FAISS index initialized.")

class DocumentIngest(BaseModel):
    text: str
    metadata: Optional[dict] = {}

class SearchQuery(BaseModel):
    query: str
    k: Optional[int] = 3
    strategy: Optional[str] = "hybrid" # hybrid, semantic, keyword

class SearchResult(BaseModel):
    text: str
    score: float
    metadata: dict
    source: str = "semantic"

@app.get("/")
def health_check():
    db_count = con.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    return {"status": "healthy", "docs_in_db": db_count, "vectors_in_faiss": index.ntotal}

@app.post("/ingest")
async def ingest_document(doc: DocumentIngest):
    """
    Embeds text and adds it to the FAISS index + DuckDB.
    """
    if not doc.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    # 1. Split text into chunks
    chunks = chunk_text(doc.text)
    if not chunks:
         return {"message": "No valid text chunks found", "chunks_count": 0}

    # 2. Generate embeddings for all chunks in batch
    embeddings = model.encode(chunks)
    
    # 3. Optimize and Add to FAISS
    faiss.normalize_L2(embeddings)
    index.add(embeddings.astype('float32'))
    
    # 4. Store text in DuckDB
    # Align IDs: We assume sequential ingestion.
    start_id = index.ntotal - len(chunks)
    
    for i, chunk_text_val in enumerate(chunks):
        doc_id = start_id + i
        meta_json = json.dumps(doc.metadata)
        con.execute("INSERT INTO documents (id, text, metadata) VALUES (?, ?, ?)", 
                   (doc_id, chunk_text_val, meta_json))

    return {"message": "Document ingested", "chunks_count": len(chunks), "total_docs_in_index": index.ntotal}

@app.post("/search", response_model=List[SearchResult])
async def search(query: SearchQuery):
    """
    Hybrid Search: Semantic (FAISS) + Keyword (DuckDB FTS)
    """
    if index.ntotal == 0:
        return []
    
    final_results = {} # Map id -> result

    # 1. Semantic Search (FAISS)
    if query.strategy in ["hybrid", "semantic"]:
        q_emb = model.encode([query.query])
        faiss.normalize_L2(q_emb)
        D, I = index.search(q_emb.astype('float32'), query.k)
        
        for j, doc_id in enumerate(I[0]):
            if doc_id == -1: continue
            
            # Fetch from DuckDB
            row = con.execute("SELECT text, metadata FROM documents WHERE id = ?", (int(doc_id),)).fetchone()
            if row:
                final_results[int(doc_id)] = SearchResult(
                    text=row[0],
                    score=float(1 / (1 + D[0][j])), # Convert L2 dist to similarity-ish score
                    metadata=json.loads(row[1]) if row[1] else {},
                    source="semantic"
                )

    # 2. Keyword Search (DuckDB FTS)
    if query.strategy in ["hybrid", "keyword"]:
        try:
             # Use DuckDB FTS BM25
            res = con.execute(f"""
                SELECT id, text, metadata, score 
                FROM (
                    SELECT *, fts_main_documents.match_bm25(id, ?) as score 
                    FROM documents
                ) 
                WHERE score IS NOT NULL 
                ORDER BY score DESC 
                LIMIT ?
            """, (query.query, query.k)).fetchall()
            
            for row in res:
                doc_id = row[0]
                if doc_id not in final_results:
                     final_results[doc_id] = SearchResult(
                        text=row[1],
                        score=row[3], # BM25 score
                        metadata=json.loads(row[2]) if row[2] else {},
                        source="keyword"
                    )
        except Exception as e:
            print(f"Keyword search warning: {e}")

    return list(final_results.values())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=80)
