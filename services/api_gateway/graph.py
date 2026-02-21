import json
from typing import TypedDict, List, Annotated, Literal
import operator
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from clients import generate_completion, query_rag

# --- State Definition ---
class ProfessorState(TypedDict):
    topic: str
    plan: List[str] # List of sub-topics
    current_index: int # Index of the current sub-topic in the plan
    messages: Annotated[List[BaseMessage], operator.add]
    mode: str  # "planning", "teaching", "answering", "finished"
    output_text: str # The final text to be spoken/returned

# --- Nodes ---

async def planner_node(state: ProfessorState):
    """Generates a lesson plan for the topic, using RAG if available."""
    topic = state["topic"]
    print(f"Planning lesson for: {topic}")
    
    # 1. Fetch Context
    context = await query_rag(topic)
    
    # 2. Generate Plan
    prompt = f"""
    You are an expert Data Engineering Professor.
    
    Context from Knowledge Base (if any):
    {context}
    
    Task: Create a short, concise lesson plan with 3-5 sub-topics to teach the concept of '{topic}'.
    
    Rules:
    1. If the context contains specific information about '{topic}' (e.g. a resume, specific docs), your plan MUST be based on that context.
    2. If the context is empty or irrelevant, you may use your general knowledge.
    3. Return ONLY a valid JSON array of strings, e.g., ["Introduction", "Core Concepts", "Best Practices"].
    4. Do not include any other text.
    """
    
    response = await generate_completion(prompt)
    try:
        # cleanup markdown code blocks if present
        cleaned_response = response.replace("```json", "").replace("```", "").strip()
        start = cleaned_response.find("[")
        end = cleaned_response.rfind("]") + 1
        if start != -1 and end != -1:
            cleaned_response = cleaned_response[start:end]
            
        plan = json.loads(cleaned_response)
        if not isinstance(plan, list):
             raise ValueError("Not a list")
    except Exception as e:
        print(f"Error parsing plan: {e}. Fallback used.")
        plan = [f"Introduction to {topic}", f"Deep Dive into {topic}", "Summary"]

    return {"plan": plan, "mode": "teaching", "current_index": 0}

async def teacher_node(state: ProfessorState):
    """Generates the teaching content for the current sub-topic."""
    plan = state["plan"]
    index = state["current_index"]
    topic = state["topic"]
    
    if index >= len(plan):
        return {"mode": "finished", "output_text": "We have completed the lesson plan. Let me know if you have any other questions!"}

    sub_topic = plan[index]
    print(f"Teaching sub-topic: {sub_topic} ({index+1}/{len(plan)})")
    
    # 1. Fetch Context specific to this sub-topic
    # We query RAG with both main topic and sub-topic
    context = await query_rag(f"{topic}: {sub_topic}")
    
    # 2. Generate Content
    prompt = f"""
    You are an expert Data Engineering Professor.
    We are learning about '{topic}'.
    Current Sub-topic: '{sub_topic}'.
    
    Context from Knowledge Base:
    {context}
    
    Task: Teach the user about the sub-topic '{sub_topic}'.
    
    Rules:
    1. STRICTLY use the provided "Context from Knowledge Base" as your primary source of truth.
    2. Only use outside knowledge if the context is missing details, but do not contradict the context.
    3. If the context is about a specific person (e.g. Resume), speak about them based on the text.
    4. Keep the explanation spoken, engaging, and clear. 
    5. Ideally 2-3 paragraphs.
    """
    
    content = await generate_completion(prompt)
    
    return {
        "output_text": content,
        "messages": [AIMessage(content=content)]
    }

async def qa_node(state: ProfessorState):
    """Answers a user's question, potentially using RAG."""
    # Get the last user message
    last_message = state["messages"][-1]
    if not isinstance(last_message, HumanMessage):
        # Should not happen if routing is correct
        return {"output_text": "I didn't catch that."}
        
    question = last_message.content
    topic = state["topic"]
    
    print(f"Answering question: {question}")
    
    # 1. Retrieval
    context = await query_rag(f"{topic} {question}")
    
    # 2. Generation
    prompt = f"""
    You are a Data Engineering Professor. You are in the middle of a lecture about '{topic}'.
    The user stopped you to ask: "{question}"
    
    Relevant technical context (from your notes):
    {context}
    
    Answer the user's question clearly and concisely. 
    After answering, ask if they are ready to continue with the lecture.
    """
    
    answer = await generate_completion(prompt)
    
    return {
        "output_text": answer,
        "mode": "answering", # Stay in answering mode until user says "continue"
        "messages": [AIMessage(content=answer)]
    }

async def next_step_node(state: ProfessorState):
    """Moves to the next step in the plan."""
    return {
        "current_index": state["current_index"] + 1,
        "mode": "teaching"
    }

# --- Routing ---

def route_user_input(state: ProfessorState) -> Literal["qa", "next_step", "teacher"]:
    """Decides where to go based on user input or current mode."""
    messages = state.get("messages", [])
    if not messages:
        return "teacher" # Should not happen usually

    last_msg = messages[-1]
    
    # If the last message was from the AI, we are waiting for user input.
    # But effectively, the graph execution stops after AI output.
    # So this router is called AFTER a new HumanMessage is added to state.
    
    if isinstance(last_msg, HumanMessage):
        text = last_msg.content.lower().strip()
        
        # Simple heuristic for "continue"
        if text in ["next", "continue", "go on", "proceed", "ok", "okay"]:
            # If we were answering, we go to next step of teaching? 
            # Or resumption of current?
            # Let's say "continue" implies moving to the next part of the lesson OR resuming.
            # If we are in 'answering' mode, 'continue' takes us back to 'teaching' the *current* step (if not finished) or *next* step?
            # Use case: "interrupt... answer... proceed with remaining topic".
            
            # Logic: If we interrupt in middle of subtopic X, we probably want to *resume* X or go to X+1?
            # For simplicity: "continue" -> go to *next* subtopic (assuming current was finished or user wants to move on).
            return "next_step"
        else:
            # It's a question / interruption
            return "qa"
            
    return "teacher"

def route_after_planning(state: ProfessorState):
    return "teacher"

def route_after_teaching(state: ProfessorState):
    # After teaching, we stop and wait for user input (interruption or continue)
    return END

def route_after_qa(state: ProfessorState):
    # After answering, we stop and wait for user input (follow up or continue)
    return END

def route_after_next(state: ProfessorState):
    return "teacher"

# --- Graph Construction ---

workflow = StateGraph(ProfessorState)

workflow.add_node("planner", planner_node)
workflow.add_node("teacher", teacher_node)
workflow.add_node("qa", qa_node)
workflow.add_node("next_step", next_step_node)

# Entry point handling
# If plan is empty, go to planner.
# If we have a plan and are "teaching", we typically stop?
# We need a conditional entry point or just rely on 'invoke' calling specific nodes.
# LangGraph standard: Define START.

def entry_router(state: ProfessorState):
    if not state.get("plan"):
        return "planner"
    # If we have a plan, why was the graph invoked?
    # Usually because a new message was added.
    return route_user_input(state)

workflow.set_conditional_entry_point(
    entry_router,
    {
        "planner": "planner",
        "qa": "qa",
        "next_step": "next_step",
        "teacher": "teacher" # Fallback
    }
)

workflow.add_edge("planner", "teacher")
workflow.add_edge("teacher", END)
workflow.add_edge("qa", END)
workflow.add_edge("next_step", "teacher")

# Persistence
memory = MemorySaver()

# Compilation
app_graph = workflow.compile(checkpointer=memory)
