from fastapi import FastAPI, HTTPException, Body, UploadFile, File, Form
from schemas import LessonStartRequest, InterruptionRequest, LessonResponse
from graph import app_graph
from clients import seed_rag_data, ingest_rag_data, fetch_rag_topics
from langchain_core.messages import HumanMessage
import uuid

app = FastAPI(title="Professor API Gateway")

@app.get("/health")
def health():
    return {"status": "ok"}

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
        "output_text": ""
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
    events = await app_graph.ainvoke(input_update, config=config)
    
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
