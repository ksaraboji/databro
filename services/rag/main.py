import os
import faiss
import numpy as np
from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from typing import List, Optional
from sentence_transformers import SentenceTransformer

app = FastAPI(title="RAG Service", version="1.0")

# --- Configuration ---
MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384  # Dimension for all-MiniLM-L6-v2
CHUNK_SIZE = 512     # Characters per chunk (approx 100-150 words)
CHUNK_OVERLAP = 50   # Overlap to maintain context between chunks

print(f"Loading embedding model: {MODEL_NAME}...")
model = SentenceTransformer(MODEL_NAME)
print("Model loaded.")

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
# Store actual text chunks corresponding to the index IDs
# In production, this would be a proper database (SQL/NoSQL)
document_store = {} 
print("FAISS index initialized.")

class DocumentIngest(BaseModel):
    text: str
    metadata: Optional[dict] = {}

class SearchQuery(BaseModel):
    query: str
    k: Optional[int] = 3

class SearchResult(BaseModel):
    text: str
    score: float
    metadata: dict

@app.get("/")
def health_check():
    return {"status": "healthy", "docs_count": index.ntotal}

@app.post("/ingest")
async def ingest_document(doc: DocumentIngest):
    """
    Embeds text and adds it to the FAISS index.
    Automatically chunks long text into smaller pieces.
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
    
    # 4. Store text for each chunk
    # We need to know where the new IDs start. 
    # If index has 100 items, and we add 5, new IDs are 100, 101, 102, 103, 104.
    start_id = index.ntotal - len(chunks)
    
    for i, chunk_text_val in enumerate(chunks):
        doc_id = start_id + i
        document_store[doc_id] = {
            "text": chunk_text_val,
            "metadata": doc.metadata,
            "chunk_index": i,
            "total_chunks_in_doc": len(chunks)
        }

    return {"message": "Document ingested", "chunks_count": len(chunks), "total_docs_in_index": index.ntotal}

@app.post("/search", response_model=List[SearchResult])
async def search(query: SearchQuery):
    """
    Semantic search for the query text.
    """
    if index.ntotal == 0:
        return []

    # Embed query
    query_embedding = model.encode([query.query])
    faiss.normalize_L2(query_embedding)
    
    # Search
    D, I = index.search(query_embedding.astype('float32'), query.k)
    
    results = []
    # I[0] contains the IDs of the neighbors
    # D[0] contains the distances
    for j, doc_id in enumerate(I[0]):
        if doc_id == -1: continue # No more results found
        
        if doc_id in document_store:
            doc_data = document_store[doc_id]
            results.append(SearchResult(
                text=doc_data["text"],
                score=float(D[0][j]), # Convert numpy float to native float
                metadata=doc_data["metadata"]
            ))
            
    return results

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=80)
