
import os
import asyncio
import httpx
from typing import List, Dict, Any, Optional, TypedDict, Annotated
import operator
import json

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser, StrOutputParser
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END
from pydantic import BaseModel, Field

# Only importing if installed, to avoid deployment crashes if env not ready
try:
    from azure.storage.blob import BlobServiceClient, ContentSettings
except ImportError as e:
    print(f"Failed to import azure.storage.blob: {e}")
    BlobServiceClient = None
    ContentSettings = None

try:
    import tweepy
except ImportError:
    tweepy = None

try:
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseUpload
except ImportError:
    build = None

# --- Custom Imports ---
try: 
    from huggingface_hub import AsyncInferenceClient, InferenceClient
except ImportError: 
    AsyncInferenceClient = None 
    InferenceClient = None
    print("Warning: huggingface_hub not installed")
import io
import tempfile
import subprocess
import os

# --- Configuration ---
HF_API_KEY = os.getenv("HF_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
AZURE_STORAGE_CONN_STR = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
CONTAINER_NAME = "marketing-assets" # Must be publicly accessible
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY") # Or OAuth credentials file path
INSTAGRAM_ACCESS_TOKEN = os.getenv("INSTAGRAM_ACCESS_TOKEN")
INSTAGRAM_ACCOUNT_ID = os.getenv("INSTAGRAM_ACCOUNT_ID") # Business Account ID
DEVTO_API_KEY = os.getenv("DEVTO_API_KEY")

HF_IMAGE_MODEL = "black-forest-labs/FLUX.1-schnell" 
# Reverting to Wan2.1 since user has Pro subscription. 
# Note: If 402 persists, check if this model requires a Dedicated Endpoint.
HF_VIDEO_MODEL = "Wan-AI/Wan2.1-T2V-14B"
HF_AUDIO_MODEL = "facebook/musicgen-small" 

# --- LangChain Models ---
llm = ChatGroq(
    temperature=0.7,
    model_name="llama-3.3-70b-versatile",
    groq_api_key=GROQ_API_KEY
)

# --- Utilities ---

def upload_to_azure(data: bytes, filename: str, content_type: str) -> Optional[str]:
    """Uploads bytes to Azure Blob Storage and returns the public URL."""
    if not AZURE_STORAGE_CONN_STR:
        print("Azure Storage Connection String (AZURE_STORAGE_CONNECTION_STRING) is missing.")
        return None
    
    if not BlobServiceClient:
        print("Azure BlobServiceClient is not available (library missing?).")
        return None
        
    try:
        blob_service_client = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONN_STR)
        blob_client = blob_service_client.get_blob_client(container=CONTAINER_NAME, blob=filename)
        my_content_settings = ContentSettings(content_type=content_type)
        blob_client.upload_blob(data, overwrite=True, content_settings=my_content_settings)
        return blob_client.url
    except Exception as e:
        print(f"Azure Upload Error: {e}")
        return None

# --- Media Generation (Custom Wrappers) ---
# Keeping these as async utility functions as LangChain doesn't have standard T2V tools yet

async def generate_image_hf(prompt: str) -> Optional[bytes]:
    """Generates an image using Hugging Face Inference API."""
    if not AsyncInferenceClient or not HF_API_KEY:
        print(f"Error: HF_API_KEY status: {'set' if HF_API_KEY else 'missing/empty'}")
        print(f"Warning: huggingface_hub installed: {AsyncInferenceClient is not None}")
        return None
    
    # Increase timeout to 120s as image generation can sometimes be slow
    client = AsyncInferenceClient(token=HF_API_KEY, timeout=120.0)
    
    try:
        # returns a PIL.Image object directly
        image = await client.text_to_image(prompt, model=HF_IMAGE_MODEL)
        
        # Convert PIL Image to bytes
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='JPEG')
        return img_byte_arr.getvalue()
    except Exception as e:
        print(f"HF Gen Error: {e}")
        return None

async def generate_audio_hf(prompt: str) -> Optional[bytes]:
    """Generates audio using Hugging Face Inference API."""
    if not AsyncInferenceClient or not HF_API_KEY:
        print("Error: HF_API_KEY missing for audio gen")
        return None

    print(f"Generating audio for: '{prompt[:30]}...' using {HF_AUDIO_MODEL}")
    try:
        # Using sync client in executor for safety
        client = InferenceClient(token=HF_API_KEY)
        loop = asyncio.get_running_loop()
        
        # Audio generation API returns raw bytes directly for text-to-audio
        audio_bytes = await loop.run_in_executor(
            None,
            lambda: client.post(json={"inputs": prompt}, model=HF_AUDIO_MODEL)
        )
        
        # If response is somehow wrapped in JSON (rare for this endpoint but possible on some fallbacks)
        if isinstance(audio_bytes, dict) and "audio" in audio_bytes:
             # Base64 decode or array process if needed. But usually it's raw.
             # This is just a safeguard. 
             pass 

        if not isinstance(audio_bytes, bytes):
            print(f"Warning: Unexpected audio response type: {type(audio_bytes)}")
            return None
            
        return audio_bytes
    except Exception as e:
        print(f"HF Audio Gen Error: {e}")
        return None

def combine_audio_video(video_bytes: bytes, audio_bytes: bytes) -> Optional[bytes]:
    """Combines video and audio bytes using ffmpeg."""
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_video:
            temp_video.write(video_bytes)
            video_path = temp_video.name
            
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_audio:
            temp_audio.write(audio_bytes)
            audio_path = temp_audio.name
            
        output_path = video_path.replace(".mp4", "_final.mp4")
        
        # ffmpeg command: loop audio if shorter, or cut if longer? 
        # -stream_loop -1 for audio might not work if input is pipe, but here it is file.
        # simpler: just merge. If audio is shorter, silence at end. If longer, cut.
        # -shortest: finish when shortest stream finishes (usually video)
        
        command = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-stream_loop", "-1", "-i", audio_path,
            "-c:v", "copy",
            "-c:a", "aac",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-shortest", # Clip audio to video length
            output_path
        ]
        
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        
        with open(output_path, "rb") as f:
            combined_bytes = f.read()
            
        # Cleanup
        os.remove(video_path)
        os.remove(audio_path)
        if os.path.exists(output_path):
            os.remove(output_path)
            
        return combined_bytes
    except Exception as e:
        print(f"FFmpeg Error: {e}")
        # Return original video if merge fails
        return video_bytes

async def generate_video_hf(prompt: str) -> Optional[bytes]:
    """
    Generates a video using Hugging Face Inference API for Wan2.1-T2V-1.3B.
    This model generates a short video clip from a text prompt.
    """
    if not AsyncInferenceClient or not HF_API_KEY:
        print("Error: HF_API_KEY not set or huggingface_hub not installed.")
        return None
        
    print(f"Generating video for: '{prompt[:50]}...' using {HF_VIDEO_MODEL}")
    
    # Increase timeout to 300s (5 mins) as video generation is very slow
    # Configure client specifically for text-to-video using fal-ai via HF Routing
    # This requires huggingface_hub >= 0.28.0
    try:
        # Switching to Sync Client for Video to avoid 'video' key errors in async output parsing
        client = InferenceClient(
            api_key=HF_API_KEY, 
            provider="fal-ai" 
        )
    except Exception as client_init_error:
        print(f"Error initializing InferenceClient with provider='fal-ai': {client_init_error}")
        return None
    
    try:
        # returns bytes for video
        # Pass model explicitly here as per documentation/snippet
        # BLOCKING CALL: Must run in thread to avoid freezing event loop
        loop = asyncio.get_running_loop()
        video_bytes = await loop.run_in_executor(
            None, 
            lambda: client.text_to_video(prompt, model=HF_VIDEO_MODEL)
        )
        return video_bytes
    except Exception as e:
        # If the specific model fails, try another free one or fail gracefully
        print(f"HF Video Gen Error with {HF_VIDEO_MODEL}: {e}")
        return None

# --- State Definition & Pydantic Config ---

class MarketingState(TypedDict):
    topic: str
    article_content: str
    headline: str
    summary: str
    tags: List[str]
    
    # Video Assets
    script: List[str] 
    image_prompts: List[str]
    video_gen_prompt: str  # <--- Added strict text-to-video prompt
    audio_segments: List[str] 
    image_urls: List[str] 
    video_url: str 
    
    # Status
    status: str 
    logs: Annotated[List[str], operator.add]
    errors: List[str]
    publish_config: Dict[str, bool]

# Data Models for Structured Output
class ArticleMetadata(BaseModel):
    headline: str = Field(description="A catchy, click-worthy headline (max 10 words)")
    summary: str = Field(description="A concise summary for Twitter (max 280 chars)")
    image_prompt: str = Field(description="A visual description for a cover image")
    tags: List[str] = Field(description="List of 5-7 relevant hashtags (e.g. #DataEngineering)")

class VideoScript(BaseModel):
    sentences: List[str] = Field(description="List of 4-6 engaging sentences for the video script (total duration ~30s)")
    visuals: List[str] = Field(description="List of visual prompts corresponding to each sentence")
    video_prompt: str = Field(description="A comprehensive, detailed prompt for generating a single high-quality 5-second background video loop. Requirements: \n1. VISUAL STYLE: Futuristic, clean, high-tech motion graphics. \n2. TEXT: Show the headline '{headline}' clearly with correct English spelling. Kinetic typography. \n3. IMAGERY: Animated 3D logos/icons relevant to the topic (e.g., if 'DuckDB', show a stylized duck/database). \n4. BRANDING: 'Databro' logo watermark in corner. \n5. SUBJECT: Abstract tech concepts, code snippets, data streams. NO PEOPLE. \n6. AUDIO: Upbeat, engaging tech background music. \n7. ENDING: Subtle icons for Twitter, YouTube, Instagram.")

# --- Nodes ---

async def content_strategist_node(state: MarketingState):
    """
    Agent 1: Content Strategist & Writer.
    Uses ChatGroq to draft article and extract metadata via LCEL.
    """
    logs = []
    topic = state.get("topic", "Data Engineering")
    logs.append(f"--- [Strategist] Drafting content for: {topic} ---")
    
    # 1. Write Article
    system = "You are an expert Content Strategist & Technical Writer."
    human = "Write a comprehensive, technical Data Engineering article about: '{topic}'. "\
            "Target audience: Junior to Mid-level Data Engineers. "\
            "Tone: Professional, educational, yet engaging. "\
            "Format: Markdown. Length: ~600 words."
            
    prompt = ChatPromptTemplate.from_messages([("system", system), ("human", human)])
    chain = prompt | llm | StrOutputParser()
    
    article = f"Error generating article for {topic}"
    try:
        article = await chain.ainvoke({"topic": topic})
    except Exception as e:
        logs.append(f"LLM Error (Article): {e}")
    
    # 2. Extract Metadata
    parser = JsonOutputParser(pydantic_object=ArticleMetadata)
    
    meta_prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a Marketing Expert. Extract metadata from the article."),
        ("human", "Article: {article}\n\n{format_instructions}\n\nProvide the headline, summary, 5-7 relevant tags, and a cover image prompt.")
    ])
    
    meta_chain = meta_prompt | llm | parser
    
    headline = f"Mastering {topic}"
    summary = "Check out our new deep dive!"
    tags = ["#DataEngineering", "#Tech"]
    image_prompts = [f"Data engineering concept for {topic}"]
    
    try:
        meta = await meta_chain.ainvoke({
            "article": article[:3000],
            "format_instructions": parser.get_format_instructions()
        })
        
        headline = meta.get("headline", headline)
        summary = meta.get("summary", summary)
        tags = meta.get("tags", tags)
        # Handle if image_prompt is missing or empty
        img_p = meta.get("image_prompt")
        if img_p:
            image_prompts = [img_p]
            
    except Exception as e:
        logs.append(f"Metadata Gen Error: {e}")

    logs.append(f"Generated Headline: {headline}")
    logs.append(f"Generated Summary: {summary}")
    logs.append(f"Generated Tags: {tags}")
    logs.append(f"Generated Image Prompts: {image_prompts}")

    return {
        "article_content": article,
        "headline": headline,
        "summary": summary,
        "tags": tags,
        "image_prompts": image_prompts,
        "logs": logs
    }

async def visual_director_node(state: MarketingState):
    """
    Agent 2: Visual Director.
    Generates the script for the reel and prompts for images using structured output.
    """
    logs = []
    logs.append("--- [Visual Director] Planning video assets ---")
    headline = state.get("headline", "New Tech Update")
    summary = state.get("summary", "")
    
    parser = JsonOutputParser(pydantic_object=VideoScript)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a Visual Director for Tech Videos. Ensure all text in video prompts is in English and spelled correctly."),
        ("human", "Create a 30s YouTube Short script (voiceover) about: '{headline}'. \nContext/Summary: {summary}\nReturns JSON with 'sentences' (for voiceover), 'visuals' (for reference), and a single high-quality 'video_prompt' for generating a 5s abstract background video loop. \nVideo Prompt must include: Kinetic Typography of Headline, Databro Logo, Topic Icons, Social Media Icons (Twitter/YT/IG) at end. NO PEOPLE.\n{format_instructions}")
    ])
    
    chain = prompt | llm | parser
    
    script = []
    new_prompts = []
    video_gen_prompt = ""
    
    try:
        data = await chain.ainvoke({
            "headline": headline, 
            "summary": summary,
            "format_instructions": parser.get_format_instructions()
        })
        
        # Ensure data is a dict
        if isinstance(data, dict):
             script = data.get("sentences", [])
             new_prompts = data.get("visuals", [])
             video_gen_prompt = data.get("video_prompt", "")
        else:
             logs.append(f"Script Gen Warning: Expected dict, got {type(data)}")
        
    except Exception as e:
        logs.append(f"Script Gen Error: {e}")
        # Fallback script
        script = [headline, "Read the full article on our blog!", "Link in bio."]
    
    # Combine existing prompts
    current_prompts = state.get("image_prompts", [])
    if not current_prompts:
        current_prompts = []
    all_prompts = current_prompts + new_prompts
    
    logs.append(f"Generated Script: {script}")
    logs.append(f"All Image Prompts: {all_prompts}")
    if video_gen_prompt:
        logs.append(f"Video Generation Prompt: {video_gen_prompt}")

    return {
        "script": script,
        "image_prompts": all_prompts,
        "video_gen_prompt": video_gen_prompt,
        "logs": logs
    }


async def production_studio_node(state: MarketingState):
    """
    Agent 3: Production Studio (Generative Video Edition).
    Uses AI text-to-video models (Wan2.1) and Flux for Images.
    Uploads generated assets to Azure Blob Storage for public access.
    """
    print("--- [Studio] Creating immersive video content ---")
    logs = ["Preparing assets..."]
    
    # 1. Generate Cover Image (FLUX.1)
    image_urls = []
    if state.get("image_prompts"):
        cover_prompt = state["image_prompts"][0]
        logs.append(f"Generating cover image: {cover_prompt[:30]}...")
        
        try:
            img_bytes = await generate_image_hf(cover_prompt)
            if img_bytes:
                filename = f"cover_{hash(cover_prompt)}.jpg"
                img_url = upload_to_azure(img_bytes, filename, "image/jpeg")
                if img_url:
                     image_urls.append(img_url) 
                     logs.append(f"Cover image uploaded successfully: {img_url}")
                else:
                     logs.append("Error: Azure Upload Failed for Image. Cover image generation failed.")
            else:
                logs.append("Error: Failed to generate cover image bytes from HF.")
        except Exception as e:
            logs.append(f"Error: Image Gen/Upload Exception: {e}")
    else:
        logs.append("Warning: No image prompts found. Skipping image generation.")
    
    # 2. Generate Video using Wan2.1
    headline = state.get("headline", "Tech Update")
    script = state.get("script", [])
    # Prefer the dedicated video prompt from Visual Director
    video_gen_prompt = state.get("video_gen_prompt")
    if not video_gen_prompt:
        first_line = script[0] if script else "Data visualization"
        summary_text = state.get("summary", "")
        # Fallback now includes summary for better context
        video_prompt = f"Cinematic {headline}, {summary_text[:50]}, {first_line}, kinetic english typography, Databro logo overlay, high quality, 4k, no people, animated icons, energetic tech sound"
    else:
        # Augment the generated prompt with strict constraints if not already present
        video_prompt = video_gen_prompt
        if "english" not in video_prompt.lower():
            video_prompt += ", explicit english text"
        if "no people" not in video_prompt.lower():
            video_prompt += ", NO PEOPLE, abstract tech visualization"
        if "databro" not in video_prompt.lower():
            video_prompt += ", with 'Databro' logo watermark"
        if "social" not in video_prompt.lower():
             video_prompt += ", with animated social media icons (Twitter, YouTube, Instagram) at end"
        if "audio" not in video_prompt.lower() and "sound" not in video_prompt.lower():
             video_prompt += ", energetic tech background music"

    logs.append(f"Generating video with prompt: {video_prompt[:100]}...")
    
    video_bytes = await generate_video_hf(video_prompt)
    
    if video_bytes:
        # --- Audio Generation & Stitching ---
        logs.append("Generating matching audio track...")
        audio_prompt = "Upbeat, futuristic tech background music, looping, synthesizer, high quality"
        try:
            audio_bytes = await generate_audio_hf(audio_prompt)
            if audio_bytes:
                logs.append("Audio generated. Stitching video and audio...")
                # Run ffmpeg in executor to avoid blocking
                loop = asyncio.get_running_loop()
                combined_bytes = await loop.run_in_executor(
                    None, 
                    lambda: combine_audio_video(video_bytes, audio_bytes)
                )
                if combined_bytes:
                    video_bytes = combined_bytes
                    logs.append("Audio stitching successful.")
                else:
                    logs.append("Warning: Audio stitching returned None, using original video.")
            else:
                logs.append("Warning: Audio generation failed, proceeding with silent video.")
        except Exception as audio_e:
             logs.append(f"Audio Processing Error: {audio_e}")

        # --- Upload ---
        video_url = ""
    
        try:
            # Hash might be negative, sanitize filename
            import hashlib
            prompt_hash = hashlib.md5(video_prompt.encode()).hexdigest()
            filename = f"video_{prompt_hash}.mp4"
            
            video_url = upload_to_azure(video_bytes, filename, "video/mp4")
            if video_url:
                logs.append(f"Video uploaded successfully: {video_url}")
            else:
                logs.append("Error: Azure Upload Failed for Video.")
                video_url = None
        except Exception as e:
            logs.append(f"Error: Exception uploading video to Azure: {e}")
            video_url = None
    else:
        logs.append(f"Error: Video generation failed or returned empty bytes. Model: {HF_VIDEO_MODEL}")
        video_url = None
    
    logs.append(f"Generated Image URLs: {image_urls}")
    logs.append(f"Generated Video URL: {video_url}")

    return {
        "image_urls": image_urls, 
        "audio_segments": [], 
        "video_url": video_url,
        "logs": logs
    }

async def social_media_manager_node(state: MarketingState):
    """
    Agent 4: Social Media Manager.
    Publishes the content to: Dev.to, Twitter, Instagram, and YouTube.
    Uses real public URLs for assets.
    """
    print("--- [SMM] Publishing content ---")
    
    logs = []
    headline = state.get('headline', 'New Tech Post')
    summary = state.get('summary', 'Check out our latest update!')
    tags_list = state.get("tags", ["#DataEngineering", "#Tech"])
    tags_str = " ".join(tags_list)
    
    # Get configuration, default to False for safety if not provided
    config = state.get("publish_config", {})
    if not config:
        config = {"devto": False, "twitter": False, "instagram": False, "youtube": False}
        logs.append("No publish config found. defaulting to FALSE for all.")

    # Get Public URLs
    # state.get returns None if key exists but value is None, so we must check for None explicitly or Use logic
    cover_url = state.get('image_urls', [])[0] if state.get('image_urls') else "https://via.placeholder.com/800x400"
    
    video_val = state.get('video_url')
    video_url = video_val if video_val else "https://example.com/video.mp4"
    
    # 1. Dev.to (Blog)
    # Use the dedicated 'cover_image' field for the hero image
    article_md = state.get('article_content', '# Data Engineering Update\nComing soon.')
    
    if config.get("devto", False):
        if DEVTO_API_KEY:
            logs.append(f"Attempting to publish to Dev.to with API Key: {DEVTO_API_KEY[:4]}...")
            try:
                 # Dev.to requires tags to be alphanumerical only (no #), and comma separated or list
                 # Clean tags: remove #, replace spaces, take top 4 (limit is usually 4)
                 cleaned_tags = [t.replace("#", "").replace(" ", "").lower() for t in tags_list][:4]
                 logs.append(f"Formatted Tags for Dev.to: {cleaned_tags}")

                 async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        "https://dev.to/api/articles",
                        headers={"api-key": DEVTO_API_KEY, "Content-Type": "application/json"},
                        json={
                            "article": {
                                "title": headline,
                                "body_markdown": article_md,
                                "published": True, # Publish immediately
                                "main_image": cover_url, # Sets the official cover/hero image
                                "tags": cleaned_tags
                            }
                        }
                    )
                    if resp.status_code in [200, 201]:
                        logs.append(f"Success: Published article to Dev.to: {resp.json().get('url')}")
                    else:
                        logs.append(f"Error: Dev.to Failed {resp.status_code}: {resp.text}")
            except Exception as e:
                logs.append(f"Error: Dev.to Exception: {e}")
        else:
            logs.append(f"Error: Dev.to API Key missing. Skipping.")
    else:
        logs.append("Info: Skipping Dev.to (User Disabled)")
    
    # 2. Twitter (Summary)
    tweet = f"{headline}\n\n{summary}\n\n{tags_str}\n\nWatch here: {video_url}"
    
    if config.get("twitter", False):
        # Temporarily commented out for testing
        # if tweepy and os.getenv("TWITTER_API_KEY"):
        #     try:
        #         # client = tweepy.Client(...)
        #         # client.create_tweet(text=tweet)
        #         logs.append("Success: Posted REAL tweet via Tweepy.")
        #     except Exception as e:
        #         logs.append(f"Error: Tweepy Error: {e}")
        # else:
        logs.append(f"Success: Posted to Twitter (Mock/Disabled): {tweet[:50]}...")
    else:
        logs.append("Info: Skipping Twitter (User Disabled)")
    
    # 3. Instagram (Reel + Image)
    # Instagram Graph API requires a public VIDEO URL for reels, which we now have.
    # No standard python client, using direct Graph API calls via httpx
    if config.get("instagram", False):
        # if INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_ACCOUNT_ID:
        #     try:
        #         # Step 1: Initialize Upload
        #         media_url = f"https://graph.facebook.com/v19.0/{INSTAGRAM_ACCOUNT_ID}/media"
        #         container_payload = {
        #             "media_type": "REELS",
        #             "video_url": video_url,
        #             "caption": caption, # access 'caption' variable if defined, currently 'caption' is undefined in SMM node scope?
        #             "access_token": INSTAGRAM_ACCESS_TOKEN
        #         }
        #         # Depending on video size, this might need resumable upload, but for shorts URL is fine
        #         async with httpx.AsyncClient() as client:
        #             res = await client.post(media_url, json=container_payload)
        #             if res.status_code == 200:
        #                 creation_id = res.json().get("id")
        #                 # Step 2: Publish
        #                 publish_url = f"https://graph.facebook.com/v19.0/{INSTAGRAM_ACCOUNT_ID}/media_publish"
        #                 pub_res = await client.post(publish_url, json={"creation_id": creation_id, "access_token": INSTAGRAM_ACCESS_TOKEN})
        #                 if pub_res.status_code == 200:
        #                     logs.append("Success: Posted Reel to Instagram successfully.")
        #                 else:
        #                     logs.append(f"Error: IG Publish Error: {pub_res.text}")
        #             else:
        #                 logs.append(f"Error: IG Upload Error: {res.text}")
        #     except Exception as e:
        #         logs.append(f"Error: Instagram API Error: {e}")
        # else:
        logs.append(f"Success: Posted Reel to Instagram (Mock/Disabled): {video_url[:30]}...")
    else:
         logs.append("Info: Skipping Instagram (User Disabled)")
    
    # 4. YouTube Shorts
    # Using google-api-python-client
    if config.get("youtube", False):
        # if build and YOUTUBE_API_KEY:
        #     try:
        #         # In production, this requires OAuth flow (pickle/json creds), not just API Key for uploads
        #         # Assuming 'youtube_creds.json' exists or environment variables for OAuth
        #         # youtube = build("youtube", "v3", credentials=...)
        #         logs.append("Warning: YouTube Upload Skipped: OAuth credentials required for upload.")
        #     except Exception as e:
        #          logs.append(f"Error: YouTube Error: {e}")
        # else:
        logs.append(f"Success: Uploaded YouTube Short from URL (Mock/Disabled): {video_url}")
    else:
        logs.append("Info: Skipping YouTube (User Disabled)")
    
    status = "finished"
    logs.append(f"Final Status: {status}")

    return {
        "status": status,
        "logs": logs
    }

# --- Graph ---

marketing_graph = StateGraph(MarketingState)

marketing_graph.add_node("strategist", content_strategist_node)
marketing_graph.add_node("visual_director", visual_director_node)
marketing_graph.add_node("production_studio", production_studio_node)
marketing_graph.add_node("social_manager", social_media_manager_node)

marketing_graph.set_entry_point("strategist")

marketing_graph.add_edge("strategist", "visual_director")
marketing_graph.add_edge("visual_director", "production_studio")
marketing_graph.add_edge("production_studio", "social_manager")
marketing_graph.add_edge("social_manager", END)

marketing_app = marketing_graph.compile()