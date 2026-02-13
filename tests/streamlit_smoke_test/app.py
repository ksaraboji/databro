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
    - GET /topics (RAG Service)
    - POST /rag/seed & /ingest (RAG Service)
    - POST /start_lesson (LLM Service + Logic)
    - POST /interact (LLM + RAG + Logic)
    - POST /listen (Speech Service STT)
    - POST /speak (Speech Service TTS)
    """)

# --- Session State ---
if "user_id" not in st.session_state:
    st.session_state.user_id = str(uuid.uuid4())
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []
if "lesson_started" not in st.session_state:
    st.session_state.lesson_started = False
if "audio_key" not in st.session_state:
    st.session_state.audio_key = 0

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

    # Helper function to handle interactions
    def process_interaction(text, play_audio=False):
        st.session_state.chat_history.append({"role": "user", "content": text})
        with st.spinner("Professor is thinking..."):
            try:
                payload = {"user_id": st.session_state.user_id, "question_text": text}
                res = requests.post(f"{gateway_url}/interact", json=payload, timeout=120)
                
                if res.status_code == 200:
                    data = res.json()
                    response_text = data["content_text"]
                    st.session_state.chat_history.append({"role": "assistant", "content": response_text})
                    
                    # If voice interaction was requested, generate and play audio
                    if play_audio:
                        with st.spinner("Synthesizing Speech..."):
                            try:
                                audio_res = requests.post(f"{gateway_url}/speak", json={"text": response_text}, timeout=60)
                                if audio_res.status_code == 200:
                                    audio_url = audio_res.json().get("audio_url")
                                    if audio_url:
                                        # Use st.audio to play the URL
                                        st.audio(audio_url, format="audio/wav", autoplay=True)
                                        # Also save it to history if we wanted to persist it, but for now just autoplay
                                else:
                                    st.warning(f"TTS Failed: {audio_res.status_code}")
                            except Exception as e:
                                st.warning(f"TTS Connection Failed: {e}")

                    # Use rerun to update the UI with new messages
                    # process_interaction is usually called from callbacks or linear flow, rerun is safe
                    # But we just played audio. If we rerun, the audio player might disappear or reset.
                    # We should probably NOT rerun if we just played audio, or rely on Streamlit's state.
                    # However, to show the text bubble, we need to rerun OR rely on the loop.
                    # Actually, since we are inside the 'with' block of the button press event usually... 
                    # Let's rely on the chat history display loop at the top of the next run.
                    # BUT, st.audio needs to be rendered NOW.
                    # If I rerun, the audio component I just added will be cleared.
                    # So I should NOT rerun if I want the audio to persist for this interaction turn.
                    # But if I don't rerun, the text bubbles won't appear until next interaction?
                    # Streamlit's new `st.chat_message` pattern handles this if we call it immediately too.
                    pass 
                else:
                    st.error(f"Error: {res.status_code} - {res.text}")
            except Exception as e:
                st.error(f"Connection error: {e}")

    # Display History Handling must be aware that we might not rerun immediately
    # We should render the history at the start of the script (already done).
    # If we add to history and don't rerun, the *new* message won't show.
    # We can explicitly render the new message chunks here for immediate feedback.
    
    # Let's refactor the history display slightly to be robust. 
    # Actually, the simplest way is to put the audio URL in the history state too?
    # No, let's just render the 'assistant' message immediately.

    # Re-writing process_interaction for better UI flow
    def process_interaction_v2(text, play_audio=False):
        # 1. Add User Message
        st.session_state.chat_history.append({"role": "user", "content": text})
        with st.chat_message("user"):
            st.write(text)

        # 2. Get AI Response
        with st.chat_message("assistant"):
            with st.spinner("Thinking..."):
                try:
                    payload = {"user_id": st.session_state.user_id, "question_text": text}
                    res = requests.post(f"{gateway_url}/interact", json=payload, timeout=120)
                    
                    if res.status_code == 200:
                        data = res.json()
                        response_text = data["content_text"]
                        st.write(response_text)
                        
                        # 3. Handle Audio
                        if play_audio:
                            with st.spinner("Speaking..."):
                                audio_res = requests.post(f"{gateway_url}/speak", json={"text": response_text}, timeout=60)
                                if audio_res.status_code == 200:
                                    audio_url = audio_res.json().get("audio_url")
                                    if audio_url:
                                        st.audio(audio_url, format="audio/wav", autoplay=True)
                        
                        # Update History so it persists on next reload
                        st.session_state.chat_history.append({"role": "assistant", "content": response_text})
                    else:
                        st.error(f"Error: {res.status_code} - {res.text}")
                except Exception as e:
                    st.error(f"Connection error: {e}")
    
    # Lesson Setup
    col_setup, col_chat = st.columns([1, 2])
    
    with col_setup:
        st.subheader("Start Lesson")
        
        # Fetch available topics
        topic_opts = ["Custom Topic"]
        try:
            # Increased timeout and added error display for debugging
            t_res = requests.get(f"{gateway_url}/topics", timeout=30)
            if t_res.status_code == 200:
                topics_list = t_res.json().get("topics", [])
                if topics_list:
                    topic_opts += topics_list
                else:
                    st.warning("Connected, but no topics found in RAG.")
            else:
                st.error(f"Failed to fetch topics: {t_res.status_code}")
        except Exception as e:
            st.error(f"Error fetching topics: {e}")

        selected_opt = st.selectbox("Select Topic from Knowledge Base", topic_opts)
        
        if selected_opt == "Custom Topic":
            lesson_topic = st.text_input("Or enter a new topic", value="DuckDB Internals")
        else:
            lesson_topic = selected_opt

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
            st.caption("Click a topic to teach it:")
            for i, item in enumerate(st.session_state.current_plan):
                if st.button(f"👉 {item}", key=f"plan_btn_{i}", use_container_width=True):
                    process_interaction(f"Please teach me about {item}", play_audio=False)
        
    # Chat Interface
    with col_chat:
        st.subheader("Interaction")
        
        # Display History
        for msg in st.session_state.chat_history:
            with st.chat_message(msg["role"]):
                st.write(msg["content"])
        
        # Input
        if st.session_state.lesson_started:
            
            # Voice Input
            st.write("---")
            st.caption("🎙️ Voice Interaction (Experimental)")
            
            # Use a dynamic key to reset the widget after successful processing
            audio_value = st.audio_input("Record your question", key=f"audio_{st.session_state.audio_key}")
            
            if audio_value:
                # 1. Transcribe
                transcribed_text = ""
                with st.spinner("Transcribing..."):
                    try:
                        files = {"file": ("audio.wav", audio_value, "audio/wav")}
                        t_res = requests.post(f"{gateway_url}/listen", files=files, timeout=60)
                        
                        if t_res.status_code == 200:
                            transcribed_text = t_res.json().get("text", "")
                        else:
                            st.error(f"Transcription Failed: {t_res.status_code}")
                    except Exception as e:
                        st.error(f"Voice Error: {e}")

                # 2. Process Interaction (Logic)
                if transcribed_text:
                    # Increment key to reset audio widget on rerun
                    st.session_state.audio_key += 1
                    # Pass directly to interaction handler with audio flag
                    process_interaction(transcribed_text, play_audio=True)

            user_input = st.chat_input("Ask a question on interject...")
            
            if user_input:
                process_interaction(user_input, play_audio=False)

