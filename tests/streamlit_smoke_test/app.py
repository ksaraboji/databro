import streamlit as st
import requests
import json
import uuid

st.set_page_config(page_title="DataBro Smoke Test", layout="wide")

st.title("DataBro Microservices Smoke Test")

# --- Configuration ---
with st.sidebar:
    st.header("Configuration")
    default_url = "https://api-gateway.victorioushill-531514fe.eastus.azurecontainerapps.io"
    gateway_url = st.text_input("API Gateway URL", value=default_url)
    
    st.info("""
    **Endpoints Tested:**
    - GET /health (Gateway)
    - GET /topics (RAG check)
    - POST /rag/seed (RAG Write)
    - POST /start_lesson (LLM + Logic)
    - POST /interact (LLM + RAG + Logic)
    """)

# --- Session State ---
if "user_id" not in st.session_state:
    st.session_state.user_id = str(uuid.uuid4())
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []
if "lesson_started" not in st.session_state:
    st.session_state.lesson_started = False

# --- Tabs ---
tab1, tab2, tab3 = st.tabs(["System Health", "RAG Management", "Professor Lesson"])

# --- Tab 1: Health ---
with tab1:
    st.header("System Health Check")
    
    col1, col2 = st.columns(2)
    
    with col1:
        if st.button("Check Gateway Health"):
            try:
                res = requests.get(f"{gateway_url}/health", timeout=30)
                if res.status_code == 200:
                    st.success(f"Gateway Healthy: {res.json()}")
                else:
                    st.error(f"Gateway Error: {res.status_code} - {res.text}")
            except Exception as e:
                st.error(f"Connection Failed: {e}")

    with col2:
        if st.button("Check RAG Topics (Connectivity)"):
            try:
                res = requests.get(f"{gateway_url}/topics", timeout=30)
                if res.status_code == 200:
                    topics = res.json().get("topics", [])
                    st.success(f"RAG Connected! Topics Found: {len(topics)}")
                    st.json(topics)
                else:
                    st.error(f"RAG Error: {res.status_code} - {res.text}")
            except Exception as e:
                st.error(f"Connection Failed: {e}")

# --- Tab 2: RAG Management ---
with tab2:
    st.header("RAG Data Management")
    
    st.info("Upload text files to the Knowledge Base.")
    
    topic_tag = st.text_input("Topic Tag", value="General")
    uploaded_file = st.file_uploader("Upload Text/Markdown File", type=["txt", "md"])
    
    col_seed, col_ingest = st.columns(2)
    
    with col_seed:
        if uploaded_file and st.button("Seed (Overwrite All)"):
            with st.spinner("Resetting & Seeding..."):
                try:
                    uploaded_file.seek(0)
                    files = {"file": (uploaded_file.name, uploaded_file, "text/plain")}
                    data = {"topic": topic_tag}
                    res = requests.post(f"{gateway_url}/rag/seed", files=files, data=data, timeout=120)
                    
                    if res.status_code == 200:
                        st.success("Seeding Successful!")
                        st.json(res.json())
                    else:
                        st.error(f"Seeding Failed: {res.status_code} - {res.text}")
                except Exception as e:
                    st.error(f"Request Failed: {e}")

    with col_ingest:
        if uploaded_file and st.button("Ingest (Append)"):
            with st.spinner("Ingesting..."):
                try:
                    uploaded_file.seek(0)
                    files = {"file": (uploaded_file.name, uploaded_file, "text/plain")}
                    data = {"topic": topic_tag}
                    res = requests.post(f"{gateway_url}/rag/ingest", files=files, data=data, timeout=120)
                    
                    if res.status_code == 200:
                        st.success("Ingestion Successful!")
                        st.json(res.json())
                    else:
                        st.error(f"Ingestion Failed: {res.status_code} - {res.text}")
                except Exception as e:
                    st.error(f"Request Failed: {e}")

# --- Tab 3: Professor Lesson ---
with tab3:
    st.header("Professor Mode (End-to-End Test)")
    
    st.markdown(f"**Session ID:** `{st.session_state.user_id}`")
    
    # Lesson Setup
    col_setup, col_chat = st.columns([1, 2])
    
    with col_setup:
        st.subheader("Start Lesson")
        lesson_topic = st.text_input("What do you want to learn?", value="DuckDB Internals")
        
        if st.button("Start Lesson"):
            st.session_state.chat_history = [] # Reset
            with st.spinner("Generating Lesson Plan..."):
                try:
                    payload = {"user_id": st.session_state.user_id, "topic": lesson_topic}
                    res = requests.post(f"{gateway_url}/start_lesson", json=payload, timeout=120)
                    
                    if res.status_code == 200:
                        data = res.json()
                        st.session_state.lesson_started = True
                        st.session_state.chat_history.append({"role": "assistant", "content": data["content_text"]})
                        st.session_state.current_plan = data.get("plan", [])
                        st.success("Lesson Started!")
                    else:
                        st.error(f"Error starting lesson: {res.status_code}")
                        st.code(res.text)
                except Exception as e:
                    st.error(f"Connection error: {e}")

        if st.session_state.get("current_plan"):
            st.write("### Lesson Plan")
            for item in st.session_state.current_plan:
                st.write(f"- {item}")
        
    # Chat Interface
    with col_chat:
        st.subheader("Interaction")
        
        # Display History
        for msg in st.session_state.chat_history:
            with st.chat_message(msg["role"]):
                st.write(msg["content"])
        
        # Input
        if st.session_state.lesson_started:
            user_input = st.chat_input("Ask a question on interject...")
            
            if user_input:
                # Add user message immediately
                st.session_state.chat_history.append({"role": "user", "content": user_input})
                
                with st.spinner("Professor is thinking..."):
                    try:
                        payload = {"user_id": st.session_state.user_id, "question_text": user_input}
                        res = requests.post(f"{gateway_url}/interact", json=payload, timeout=120)
                        
                        if res.status_code == 200:
                            data = res.json()
                            st.session_state.chat_history.append({"role": "assistant", "content": data["content_text"]})
                            st.rerun()
                        else:
                            st.error(f"Error: {res.status_code} - {res.text}")
                    except Exception as e:
                        st.error(f"Connection error: {e}")

