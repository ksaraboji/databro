import os
import faiss
import numpy as np
import duckdb
import json
from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from typing import List, Optional
from sentence_transformers import SentenceTransformer
from azure.storage.blob import BlobServiceClient

app = FastAPI(title="RAG Service", version="1.2")

# --- Configuration ---
MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384
CHUNK_SIZE = 512
CHUNK_OVERLAP = 50
DB_PATH = "rag_data.duckdb"
FAISS_INDEX_PATH = "rag_index.faiss"

# Persistence Config
AZURE_CONN_STR = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
BLOB_CONTAINER = os.getenv("BLOB_CONTAINER_NAME", "rag-state")

print(f"Loading embedding model: {MODEL_NAME}...")
model = SentenceTransformer(MODEL_NAME)
print("Model loaded.")

# --- Persistence Helpers ---
def download_state():
    """Download DuckDB and FAISS index from Blob Storage on startup."""
    if not AZURE_CONN_STR:
        print("Warning: No Azure Storage Connection String found. Running in ephemeral mode.")
        return

    try:
        blob_service = BlobServiceClient.from_connection_string(AZURE_CONN_STR)
        container = blob_service.get_container_client(BLOB_CONTAINER)
        
        if not container.exists():
            print(f"Container {BLOB_CONTAINER} does not exist. Creating...")
            container.create_container()
            return # Context is empty

        # Download DuckDB
        blob_db = container.get_blob_client(DB_PATH)
        if blob_db.exists():
            print("Downloading DuckDB state...")
            with open(DB_PATH, "wb") as f:
                f.write(blob_db.download_blob().readall())

        # Download FAISS
        blob_faiss = container.get_blob_client(FAISS_INDEX_PATH)
        if blob_faiss.exists():
            print("Downloading FAISS index...")
            with open(FAISS_INDEX_PATH, "wb") as f:
                f.write(blob_faiss.download_blob().readall())
                
    except Exception as e:
        print(f"Error downloading state: {e}")

def upload_state():
    """Upload DuckDB and FAISS index to Blob Storage."""
    if not AZURE_CONN_STR:
        return

    try:
        blob_service = BlobServiceClient.from_connection_string(AZURE_CONN_STR)
        container = blob_service.get_container_client(BLOB_CONTAINER)

        # Upload DuckDB
        if os.path.exists(DB_PATH):
            # Checkpoint to ensure data is flushed to disk
            con.checkpoint() 
            with open(DB_PATH, "rb") as f:
                container.upload_blob(DB_PATH, f, overwrite=True)
        
        # Upload FAISS
        faiss.write_index(index, FAISS_INDEX_PATH)
        with open(FAISS_INDEX_PATH, "rb") as f:
            container.upload_blob(FAISS_INDEX_PATH, f, overwrite=True)
            
        print("State saved to Azure Blob Storage.")
            
    except Exception as e:
        print(f"Error uploading state: {e}")

# --- Initialize State ---
print("Initializing state...")
download_state()

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
try:
    con.execute("INSTALL fts; LOAD fts;")
    con.execute("PRAGMA create_fts_index('documents', 'id', 'text');")
    print("DuckDB FTS initialized.")
except Exception as e:
    print(f"Warning: FTS init failed: {e}")

# --- FAISS Initialization ---
if os.path.exists(FAISS_INDEX_PATH):
    print("Loading FAISS index from disk...")
    index = faiss.read_index(FAISS_INDEX_PATH)
else:
    print("Creating new FAISS index...")
    index = faiss.IndexFlatL2(EMBEDDING_DIM)

# --- Helper Functions ---

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
    
    # Trigger upload to blob storage
    upload_state()

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
