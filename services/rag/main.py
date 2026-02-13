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

# Persistence Config (Global)
AZURE_CONN_STR = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
BLOB_CONTAINER = os.getenv("BLOB_CONTAINER_NAME", "rag-state")

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
        
        if not container.exists():
            container.create_container()

        # Upload DuckDB (Includes FTS index)
        if con:
             # Checkpoint to ensure data is flushed to disk BEFORE reading the file
             try:
                con.checkpoint()
             except Exception as e:
                print(f"Warning: Checkpoint failed during upload: {e}")

        if os.path.exists(DB_PATH):
            with open(DB_PATH, "rb") as f:
                container.upload_blob(DB_PATH, f, overwrite=True)
        
        # Upload FAISS
        if index:
            faiss.write_index(index, FAISS_INDEX_PATH)
            
        if os.path.exists(FAISS_INDEX_PATH):
            with open(FAISS_INDEX_PATH, "rb") as f:
                container.upload_blob(FAISS_INDEX_PATH, f, overwrite=True)
            
        print("State saved to Azure Blob Storage.")
            
    except Exception as e:
        print(f"Error uploading state: {e}")

import asyncio

# --- Global Vars (Lazy Init) ---
model = None
con = None
index = None
state_lock = None  # Will be initialized on startup

def get_lock():
    global state_lock
    if state_lock is None:
        state_lock = asyncio.Lock()
    return state_lock

def check_initialization():
    if model is None:
        raise HTTPException(status_code=503, detail="Embedding model not initialized")
    if con is None:
        raise HTTPException(status_code=503, detail="Database connection not initialized")
    if index is None:
        raise HTTPException(status_code=503, detail="Vector index not initialized")

# --- Startup Event ---
@app.on_event("startup")
async def startup_event():
    global model, con, index, state_lock
    
    # Ensure lock is created in the event loop context
    if state_lock is None:
        state_lock = asyncio.Lock()
    
    print("Starting RAG Service...")
    
    # 1. Load Model
    try:
        print(f"Loading embedding model: {MODEL_NAME}...")
        model = SentenceTransformer(MODEL_NAME)
        print("Model loaded.")
    except Exception as e:
        print(f"CRITICAL: Failed to load model: {e}")
        # We don't exit, so logs can be read. But endpoints will fail.
    
    # 2. Download State
    print("Initializing state...")
    download_state()

    # 3. DuckDB Setup
    try:
        print(f"Connecting to DuckDB at {DB_PATH}...")
        # Check if file exists. If it doesn't, we need to create schema.
        db_exists = os.path.exists(DB_PATH)
        con = duckdb.connect(DB_PATH)
        
        # Explicitly Test Connection
        try:
             con.execute("SELECT 1")
        except Exception as e:
             print(f"DB Connection check failed: {e}")
             raise e

    except Exception as e:
        print(f"Error connecting to DuckDB: {e}. Starting with fresh DB.")
        if os.path.exists(DB_PATH):
            try:
                os.remove(DB_PATH)
            except:
                pass
        con = duckdb.connect(DB_PATH)

    # Initialize schema with more robust checks
    # Check if table exists
    table_exists = False
    try:
            # Just try to query. If table doesn't exist, this throws Catalog Exception
            con.execute("SELECT COUNT(*) FROM documents")
            table_exists = True
    except Exception as e:
            print(f"Table 'documents' check failed ({e}). Creating...")
            table_exists = False

    if not table_exists:
            try:
                # Ensure clean slate if check failed
                con.execute("DROP SEQUENCE IF EXISTS seq_doc_id")
                con.execute("CREATE SEQUENCE seq_doc_id START 0;")
                con.execute("""
                    CREATE TABLE documents (
                        id INTEGER PRIMARY KEY DEFAULT nextval('seq_doc_id'),
                        text VARCHAR,
                        metadata JSON
                    );
                """)
                print("Table 'documents' created.")
                
                # Checkpointing is CRITICAL in DuckDB to persist schema changes
                con.checkpoint()
            except Exception as create_err:
                print(f"CRITICAL: Error Creating Table: {create_err}")
                raise create_err
    
    # Initialize FTS
    try:
        con.execute("INSTALL fts; LOAD fts;")
        # To be safe, we can drop the index if it exists and recreate it, or catch the error.
        con.execute("PRAGMA create_fts_index('documents', 'id', 'text');")
        print("DuckDB FTS initialized.")
    except Exception as fts_error:
            # Expected if index already exists
            print(f"FTS Init Note: {fts_error}")

    # 4. FAISS Initialization
    try:
        if os.path.exists(FAISS_INDEX_PATH):
            print("Loading FAISS index from disk...")
            index = faiss.read_index(FAISS_INDEX_PATH)
        else:
            print("No FAISS index found. Creating new...")
            index = faiss.IndexFlatL2(EMBEDDING_DIM)
    except Exception as e:
        print(f"Error loading FAISS index: {e}. Creating new index...")
        if os.path.exists(FAISS_INDEX_PATH):
            try:
                os.remove(FAISS_INDEX_PATH)
            except:
                pass
        index = faiss.IndexFlatL2(EMBEDDING_DIM)
    
    # 5. Consistency Check (Crucial for correct ID mapping)
    try:
        # Ensure con is valid before using it
        if con:
            db_count = con.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
            faiss_count = index.ntotal
            print(f"Startup Consistency Check: DB={db_count}, FAISS={faiss_count}")
            
            if db_count != faiss_count:
                print("WARNING: State inconsistency detected between DB and Index!")
                
                # Simple Fix: If DB > Index, we could delete extra rows to keep future IDs aligned.
                if db_count > faiss_count:
                    print(f"Trimming DB to match FAISS count ({faiss_count})...")
                    con.execute("DELETE FROM documents WHERE id >= ?", (faiss_count,))
                    con.checkpoint()
                
                if db_count < faiss_count:
                     print("Critical: FAISS has more vectors than DB rows. Search may fail for recent items.")
    except Exception as e:
        print(f"Consistency check failed: {e}")

    print("Startup complete.")

# --- Helper Functions ---

def chunk_text(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    """Simple chunking by character count with overlap."""
    if not text:
        return []
    chunks = []
    start = 0
    text_len = len(text)
    
    while start < text_len:
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append(chunk)
        start += (chunk_size - overlap)
        
    return chunks

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
    check_initialization()
    try:
        db_count = con.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        return {"status": "healthy", "docs_in_db": db_count, "vectors_in_faiss": index.ntotal}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")

@app.post("/seed")
async def seed_document(doc: DocumentIngest):
    """
    Resets the DB and Index, then ingests the document.
    """
    check_initialization()
    global index
    
    if not doc.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    async with get_lock():
        try:
            # 1. Reset State
            print("Resetting state for seed...")
            index = faiss.IndexFlatL2(EMBEDDING_DIM)
            con.execute("DELETE FROM documents") 
            con.checkpoint() # Ensure delete is persisted
            
            # 2. Split text into chunks
            chunks = chunk_text(doc.text)
            if not chunks:
                return {"message": "No valid text chunks found", "chunks_count": 0}

            # 3. Generate embeddings
            print("Generating embeddings...")
            # Run model encoding in a thread to avoid blocking the event loop
            embeddings = await asyncio.to_thread(model.encode, chunks)
            
            # 4. Optimize and Add to FAISS
            faiss.normalize_L2(embeddings)
            index.add(embeddings.astype('float32'))
            
            # 5. Store text in DuckDB
            print("Storing in DuckDB...")
            start_id = 0
            
            for i, chunk_text_val in enumerate(chunks):
                doc_id = start_id + i
                meta_json = json.dumps(doc.metadata) if doc.metadata else json.dumps({"source": "seed", "chunk_index": i})
                con.execute("INSERT INTO documents (id, text, metadata) VALUES (?, ?, ?)", 
                        (doc_id, chunk_text_val, meta_json))
            
            # 6. Trigger upload
            print("Uploading state...")
            # Uploading can take time, do it under lock to prevent inconsistent state
            await asyncio.to_thread(upload_state)

            return {"message": "RAG seeded successfully", "chunks_count": len(chunks), "total_docs_in_index": index.ntotal}
        except Exception as e:
            print(f"Seed failed: {e}")
            raise HTTPException(status_code=500, detail=f"Seed failed: {str(e)}")

@app.post("/ingest")
async def ingest_document(doc: DocumentIngest):
    """
    Embeds text and adds it to the FAISS index + DuckDB.
    """
    check_initialization()
    
    if not doc.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    async with get_lock():
        try:
            # 1. Split text into chunks
            chunks = chunk_text(doc.text)
            if not chunks:
                return {"message": "No valid text chunks found", "chunks_count": 0}

            # 2. Generate embeddings for all chunks in batch
            # Run encoding in thread
            embeddings = await asyncio.to_thread(model.encode, chunks)
            
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
            await asyncio.to_thread(upload_state)

            return {"message": "Document ingested", "chunks_count": len(chunks), "total_docs_in_index": index.ntotal}
        except Exception as e:
            print(f"Ingest failed: {e}")
            raise HTTPException(status_code=500, detail=f"Ingest failed: {str(e)}")

@app.post("/search", response_model=List[SearchResult])
async def search_documents(query: SearchQuery):
    """
    Semantic + Keyword search.
    """
    check_initialization()
    
    if not query.query.strip():
        return []
    
    try:
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
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.get("/topics")
def get_topics():
    """Returns list of unique topics found in document metadata."""
    check_initialization()
    try:
        # Extract 'topic' from metadata JSON. Assumes metadata is like {"topic": "X", ...}
        # DuckDB JSON extraction: json_extract_string(json_col, '$.key')
        query = "SELECT DISTINCT json_extract_string(metadata, '$.topic') FROM documents"
        results = con.execute(query).fetchall()
        
        # Filter out None values
        topics = [r[0] for r in results if r[0]]
        return {"topics": sorted(topics)}
    except Exception as e:
        print(f"Error fetching topics: {e}")
        return {"topics": []}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=80)
