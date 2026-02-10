from fastapi import FastAPI, HTTPException, Body
from schemas import LessonStartRequest, InterruptionRequest, LessonResponse
from graph import app_graph
from langchain_core.messages import HumanMessage
import uuid

app = FastAPI(title="Professor API Gateway")

@app.get("/health")
def health():
    return {"status": "ok"}

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
        current_section=section_name
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
        current_section=section_name
    )
