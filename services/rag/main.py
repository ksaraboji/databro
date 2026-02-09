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

print(f"Loading embedding model: {MODEL_NAME}...")
model = SentenceTransformer(MODEL_NAME)
print("Model loaded.")

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
    """
    if not doc.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    # Generate embedding
    embedding = model.encode([doc.text])
    
    # Add to FAISS
    # faiss expects float32
    faiss.normalize_L2(embedding) # Optional: normalize for cosine similarity approximation with L2
    index.add(embedding.astype('float32'))
    
    # Store the text using the index ID (0-based incremental)
    doc_id = index.ntotal - 1
    document_store[doc_id] = {
        "text": doc.text,
        "metadata": doc.metadata
    }

    return {"message": "Document ingested", "id": doc_id, "total_docs": index.ntotal}

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
