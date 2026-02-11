import os
import faiss
import numpy as np
import duckdb
import json
from sentence_transformers import SentenceTransformer
from azure.storage.blob import BlobServiceClient
import sys

# Configuration
MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384
CHUNK_SIZE = 512
CHUNK_OVERLAP = 50
DB_PATH = "rag_data.duckdb"
FAISS_INDEX_PATH = "rag_index.faiss"
CONTAINER_NAME = "rag-state"

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

def main():
    conn_str = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    if not conn_str:
        print("Error: AZURE_STORAGE_CONNECTION_STRING environment variable is not set.")
        sys.exit(1)

    input_file = "duckdb_intro.md"
    if not os.path.exists(input_file):
        print(f"Error: {input_file} not found.")
        sys.exit(1)

    print(f"Reading {input_file}...")
    with open(input_file, "r") as f:
        content = f.read()

    print(f"Loading embedding model: {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)

    # Initialize DuckDB
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        
    con = duckdb.connect(DB_PATH)
    con.execute("CREATE SEQUENCE seq_doc_id START 0;")
    con.execute("""
        CREATE TABLE documents (
            id INTEGER PRIMARY KEY DEFAULT nextval('seq_doc_id'),
            text VARCHAR,
            metadata JSON
        );
    """)
    # FTS Init
    con.execute("INSTALL fts; LOAD fts;")
    con.execute("PRAGMA create_fts_index('documents', 'id', 'text');")

    # Initialize FAISS
    index = faiss.IndexFlatL2(EMBEDDING_DIM)

    # Chunk and Ingest
    print("Chunking and Ingesting...")
    chunks = chunk_text(content)
    if not chunks:
        print("No content to ingest.")
        return

    embeddings = model.encode(chunks)
    faiss.normalize_L2(embeddings)
    index.add(embeddings.astype('float32'))

    # Store in DuckDB
    start_id = 0 
    for i, chunk_text_val in enumerate(chunks):
        doc_id = start_id + i
        meta = {"source": input_file, "chunk_index": i}
        con.execute("INSERT INTO documents (id, text, metadata) VALUES (?, ?, ?)", 
                   (doc_id, chunk_text_val, json.dumps(meta)))

    con.close() # Close to flush
    
    print(f"Ingested {len(chunks)} chunks into {DB_PATH} and {FAISS_INDEX_PATH}")

    # Upload to Azure Blob Storage
    print("Uploading to Azure Blob Storage...")
    try:
        blob_service = BlobServiceClient.from_connection_string(conn_str)
        container_client = blob_service.get_container_client(CONTAINER_NAME)
        
        if not container_client.exists():
            container_client.create_container()

        # Upload DuckDB
        with open(DB_PATH, "rb") as data:
            container_client.upload_blob(name=DB_PATH, data=data, overwrite=True)
            
        # Upload FAISS
        faiss.write_index(index, FAISS_INDEX_PATH)
        with open(FAISS_INDEX_PATH, "rb") as data:
            container_client.upload_blob(name=FAISS_INDEX_PATH, data=data, overwrite=True)
            
        print("Upload successful!")
        
    except Exception as e:
        print(f"Upload failed: {e}")

if __name__ == "__main__":
    main()
