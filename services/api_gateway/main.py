from fastapi import FastAPI, HTTPException, Body, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from schemas import LessonStartRequest, InterruptionRequest, LessonResponse, MarketingRequest, MarketingResponse
from graph import app_graph
from marketing import marketing_app, MarketingState
from clients import seed_rag_data, ingest_rag_data, fetch_rag_topics, transcribe_audio, synthesize_speech
from langchain_core.messages import HumanMessage
import uuid
import io
import asyncio
from clients import generate_completion
from visitor_counter import get_and_increment_visitor_count, get_visitor_stats

# --- Marketing Agent Functions ---
marketing_jobs = {}
async def run_marketing_job(job_id: str, topic: str, publish_config: dict = None):
    """
    Runs the marketing agent workflow in the background.
    """
    try:
        initial_state = {
            "topic": topic,
            "article_content": "",
            "headline": "",
            "summary": "",
            "script": [],
            "image_prompts": [],
            "audio_segments": [],
            "image_urls": [],
            "video_url": "",
            "tags": [],
            "status": "starting",
            "logs": [],
            "errors": [],
            "publish_config": publish_config or {}
        }
        
        # Async invoke the graph
        config = {"configurable": {"thread_id": job_id}}
        final_state = await marketing_app.ainvoke(initial_state, config=config)
        
        marketing_jobs[job_id] = {
            "status": final_state.get("status", "finished"),
            "result": final_state
        }
    except Exception as e:
        print(f"Marketing Job Error: {e}")
        marketing_jobs[job_id] = {"status": "failed", "error": str(e)}

# -------------------------------

app = FastAPI(title="Professor API Gateway")

@app.get("/marketing/status/{job_id}", response_model=MarketingResponse)
async def get_marketing_status(job_id: str):
    job = marketing_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    result = job.get("result", {})
    return MarketingResponse(
        job_id=job_id,
        status=job.get("status", "unknown"),
        headline=result.get("headline"),
        summary=result.get("summary"),
        article_content=result.get("article_content"),
        logs=result.get("logs")
    )

@app.post("/marketing/generate", response_model=MarketingResponse)
async def generate_marketing_campaign(req: MarketingRequest, background_tasks: BackgroundTasks):
    # Authorization mock
    if req.admin_id != "admin_secret_123":
        raise HTTPException(status_code=403, detail="Unauthorized")
        
    job_id = str(uuid.uuid4())
    marketing_jobs[job_id] = {"status": "queued"}
    
    # Run in background
    background_tasks.add_task(run_marketing_job, job_id, req.topic, req.publish_config)
    
    return MarketingResponse(job_id=job_id, status="queued", logs=["Job started in background."])

@app.get("/visitor-count")
async def get_visitor_count(location: str = "Unknown"):
    """Increments and returns the current visitor count with location tracking."""
    try:
        count = await get_and_increment_visitor_count(location)
        return {"count": count}
    except Exception as e:
        # Fallback if DB is down
        return {"count": 1}

@app.get("/visitor-stats")
async def get_visitor_statistics():
    """Returns total visitor count and location breakdown."""
    try:
        stats = await get_visitor_stats()
        return stats
    except Exception as e:
        return {"total": 0, "locations": {}}


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# synchronous function to be run in threadpool
def extract_text_sync(filename: str, content: bytes) -> str:
    text = ""
    
    # Try imports once
    has_pypdf = False
    has_docx = False
    try:
        import pypdf
        has_pypdf = True
    except ImportError: pass
    
    try:
        import docx
        has_docx = True
    except ImportError: pass

    try:
        if filename.endswith(".pdf"):
            if not has_pypdf: return ""
            pdf_reader = pypdf.PdfReader(io.BytesIO(content))
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
        elif filename.endswith(".docx"):
            if not has_docx: return ""
            doc = docx.Document(io.BytesIO(content))
            for para in doc.paragraphs:
                text += para.text + "\n"
        elif filename.endswith(".txt") or filename.endswith(".md"):
            try:
                text = content.decode("utf-8")
            except:
                text = content.decode("latin-1")
        else:
            return ""
    except Exception as e:
        print(f"Error extracting text: {e}")
        return ""
        
    # Sanitize
    return text.replace("\x00", "").strip()

async def extract_text_from_file(file: UploadFile, content: bytes) -> str:
    filename = file.filename.lower()
    
    try:
        # Run CPU intensive extraction in a separate thread
        text = await run_in_threadpool(extract_text_sync, filename, content)
    except Exception as e:
        print(f"Extraction failed in threadpool: {e}")
        text = ""
    
    if not text or not text.strip():
        # Fallback check before failing
        if filename.endswith(('.txt', '.md')):
            try:
                text = content.decode('utf-8')
            except:
                pass
    
    # If still empty, raise error
    if not text or not text.strip():
         print(f"Failed to extract text from {filename}")
         raise HTTPException(status_code=400, detail="Unsupported file format or failed to extract text (content empty).")
         
    return text

def chunk_text(text, chunk_size=12000, overlap=500):
    """
    Splits text into chunks of roughly `chunk_size` characters, 
    respecting word boundaries if possible.
    Llama 3.2 context is ~128k, but keeping prompts smaller (8k-16k) 
    ensures faster/better attention.
    """
    if not text:
        return []
        
    chunks = []
    start = 0
    text_len = len(text)
    
    while start < text_len:
        end = start + chunk_size
        
        # If we are not at the end of text, try to find a space to break at
        if end < text_len:
            # Look for the last space within the chunk to avoid splitting words
            last_space = text.rfind(' ', start, end)
            if last_space != -1 and last_space > start:
                end = last_space
        
        chunk = text[start:end]
        chunks.append(chunk)
        
        # Move start forward, subtracting overlap
        start = end - overlap
        
        # Prevent infinite loops if overlap >= chunk_size or no progress
        if start >= end:
            start = end
            
    return chunks

@app.post("/summarize")
async def summarize_document_endpoint(file: UploadFile = File(...)):
    """
    Summarize an uploaded document (PDF, DOCX, TXT).
    Uses Map-Reduce strategy for large documents.
    """
    content = await file.read()
    if not content:
         raise HTTPException(status_code=400, detail="Empty file uploaded.")
         
    text = await extract_text_from_file(file, content)
    
    # Run CPU intensive text sanitization in threadpool
    text = await run_in_threadpool(lambda t: t.replace("\x00", "").strip(), text)
    
    if len(text) < 50:
        raise HTTPException(status_code=400, detail="Document content too short to summarize.")
        
    # --- MAP PHASE: Chunking ---
    # We use a safe chunk size (~12k chars is ~3k tokens).
    # This leaves plenty of room for the model's response.
    # Offload chunking to threadpool
    chunks = await run_in_threadpool(chunk_text, text, chunk_size=12000, overlap=500)
    
    if len(chunks) == 1:
        # Simple case: fits in one context
        prompt = f"Please provide a concise summary of the following document. Capture the main points, key arguments, and any conclusions.\n\nDocument Content:\n{text}"
        summary = await generate_completion(prompt)
        return {"summary": summary, "original_length": len(text), "method": "direct"}
    
    # --- REDUCE PHASE: Recursive Summarization ---
    print(f"Document too large ({len(text)} chars). Processing {len(chunks)} chunks...")
    
    # Use threadpool for chunk summaries to parallelize and avoid blocking
    import asyncio
    
    async def process_chunk(i, chunk):
        prompt = f"Summarize the following section of a larger document. Focus on key facts and details.\n\nSection {i+1}:\n{chunk}"
        return await generate_completion(prompt)

    # Launch all chunk summarizations in parallel
    chunk_summaries = await asyncio.gather(*(process_chunk(i, chunk) for i, chunk in enumerate(chunks)))
    
    # Combined Summary
    combined_text = "\n\n".join(chunk_summaries)
    
    # If the combined summaries are STILL too big, we might need a second pass,
    # but for now, let's assume the reduction was sufficient (usually reduces by 10x).
    final_prompt = f"Below are summaries of different sections of a document. Please combine them into one coherent, flowing executive summary.\n\nSection Summaries:\n{combined_text}"
    
    final_summary = await generate_completion(final_prompt)
    
    return {
        "summary": final_summary, 
        "original_length": len(text),
        "method": "map_reduce", 
        "chunks_processed": len(chunks)
    }

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/listen")
async def listen_endpoint(file: UploadFile = File(...)):
    """
    Proxy endpoint for Speech-to-Text.
    """
    content = await file.read()
    result = await transcribe_audio(content, file.filename)
    
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
        
    return result


@app.post("/speak")
async def speak_endpoint(text: str = Body(..., embed=True)):
    """
    Proxy endpoint for Text-to-Speech.
    Returns a URL to the generated audio file.
    """
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")
        
    result = await synthesize_speech(text)
    
    if "error" in result:
        # Pass through the error detail from the Speech Service
        raise HTTPException(status_code=500, detail=result["error"])
        
    audio_url = result.get("audio_url")
    if not audio_url:
        raise HTTPException(status_code=500, detail="Speech synthesis returned no URL but no error reported.")
        
    return {"audio_url": audio_url}

@app.get("/topics")
async def get_topics():
    topics = await fetch_rag_topics()
    return {"topics": topics}

@app.post("/start_lesson", response_model=LessonResponse)
async def start_lesson(req: LessonStartRequest):
    # Use user_id as thread_id. If user wants multiple sessions, they need different IDs 
    # or we handle session IDs separately.
    thread_id = req.user_id
    config = {"configurable": {"thread_id": thread_id}}
    
    # Initialize state
    # Note: 'messages' will be appended to if thread exists. 
    # For a clean start, we might want to ensure a new thread_id or reset logic.
    initial_state = {
        "topic": req.topic,
        "plan": [], # Reset plan
        "current_index": 0, # Reset index
        "mode": "planning",
        "output_text": "",
        "use_rag": False # Default, will be set by planner
    }
    
    # Run the graph
    # This will trigger 'planner' -> 'teacher' -> END
    events = await app_graph.ainvoke(initial_state, config=config)
    
    current_plan = events.get("plan", [])
    current_idx = events.get("current_index", 0)
    section_name = current_plan[current_idx] if current_plan and current_idx < len(current_plan) else None

    return LessonResponse(
        content_text=events["output_text"],
        is_finished=events.get("mode") == "finished",
        current_section=section_name,
        plan=current_plan
    )

@app.post("/conversate")
async def conversate_endpoint(file: UploadFile = File(...), user_id: str = Form(...)):
    """
    All-in-one conversational endpoint.
    1. Transcribe Audio (STT)
    2. Process Logic (LLM + RAG)
    3. Synthesize Speech (TTS)
    """
    # 1. Transcribe
    content = await file.read()
    stt_res = await transcribe_audio(content, file.filename)
    if "error" in stt_res or not stt_res.get("text"):
        raise HTTPException(status_code=500, detail=stt_res.get("error", "Transcription failed"))
    
    user_text = stt_res["text"]

    if not user_text:
        return {"user_text": "", "response_text": "I didn't catch that.", "audio_url": None}

    # 2. Logic (Interact)
    config = {"configurable": {"thread_id": user_id}}
    input_update = {"messages": [HumanMessage(content=user_text)]}

    try:
        events = await app_graph.ainvoke(input_update, config=config)
        response_text = events["output_text"]
    except Exception as e:
        print(f"Graph Error: {e}")
        response_text = "I'm having trouble thinking right now."

    # 3. Synthesize (TTS)
    tts_result = await synthesize_speech(response_text)
    audio_url = None
    if isinstance(tts_result, dict) and "audio_url" in tts_result:
        audio_url = tts_result["audio_url"]
    
    return {
        "user_text": user_text,
        "response_text": response_text,
        "audio_url": audio_url
    }

@app.post("/interact", response_model=LessonResponse)
async def interact(req: InterruptionRequest):
    config = {"configurable": {"thread_id": req.user_id}}
    
    # What did the user say?
    user_text = req.question_text
    if not user_text:
         # Default to continue if empty
         user_text = "continue" 

    # Prepare input for the graph update
    # We pass the new message into invoke. 
    # The state definition uses operator.add for messages, so it appends.
    input_update = {"messages": [HumanMessage(content=user_text)]}
    
    # Run the graph
    # entry_router will see the new message and route accordingly
    try:
        events = await app_graph.ainvoke(input_update, config=config)
    except Exception as e:
        print(f"Error in graph execution: {e}")
        return LessonResponse(
            content_text="I'm having trouble thinking right now. Please try again.",
            is_finished=False,
            current_section=None,
            plan=[]
        )
    
    current_plan = events.get("plan", [])
    current_idx = events.get("current_index", 0)
    section_name = current_plan[current_idx] if current_plan and current_idx < len(current_plan) else None
    
    return LessonResponse(
        content_text=events["output_text"],
        is_finished=events.get("mode") == "finished",
        current_section=section_name,
        plan=current_plan
    )

@app.post("/rag/seed")
async def seed_rag_endpoint(file: UploadFile = File(...), topic: str = Form(None)):
    """
    Upload a text file (e.g., Markdown) to seed the RAG service.
    This replaces existing RAG data.
    """
    content = await file.read()
    try:
        text_content = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
             text_content = content.decode("latin-1")
        except:
             raise HTTPException(status_code=400, detail="Could not decode file content. Please upload UTF-8 text.")

    result = await seed_rag_data(text_content, file.filename, topic)
    
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
        
    return result

@app.post("/rag/ingest")
async def ingest_rag_endpoint(file: UploadFile = File(...), topic: str = Form(None)):
    """
    Upload a text file (e.g., Markdown) to ingest into the RAG service.
    This appends to existing RAG data.
    """
    content = await file.read()
    try:
        text_content = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
             text_content = content.decode("latin-1")
        except:
             raise HTTPException(status_code=400, detail="Could not decode file content. Please upload UTF-8 text.")

    result = await ingest_rag_data(text_content, file.filename, topic)
    
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
        
    return result
