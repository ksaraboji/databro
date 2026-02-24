
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
    from huggingface_hub import AsyncInferenceClient 
except ImportError: 
    AsyncInferenceClient = None 
    print("Warning: huggingface_hub not installed")
import io

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
HF_VIDEO_MODEL = "Wan-AI/Wan2.1-T2V-1.3B" 

# --- LangChain Models ---
llm = ChatGroq(
    temperature=0.7,
    model_name="llama-3.3-70b-versatile",
    groq_api_key=GROQ_API_KEY
)

# --- Utilities ---

def upload_to_azure(data: bytes, filename: str, content_type: str) -> str:
    """Uploads bytes to Azure Blob Storage and returns the public URL."""
    if not AZURE_STORAGE_CONN_STR:
        print("Azure Storage Connection String (AZURE_STORAGE_CONNECTION_STRING) is missing.")
        return f"https://mock-storage.com/{filename}"
    
    if not BlobServiceClient:
        print("Azure BlobServiceClient is not available (library missing?).")
        return f"https://mock-storage.com/{filename}"
        
    try:
        blob_service_client = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONN_STR)
        blob_client = blob_service_client.get_blob_client(container=CONTAINER_NAME, blob=filename)
        my_content_settings = ContentSettings(content_type=content_type)
        blob_client.upload_blob(data, overwrite=True, content_settings=my_content_settings
        blob_client.upload_blob(data, overwrite=True, content_settings={"content_type": content_type})
        return blob_client.url
    except Exception as e:
        print(f"Azure Upload Error: {e}")
        return f"https://mock-storage.com/{filename}"

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
        # Initialize client with provider, but pass model in the method call as per docs
        client = AsyncInferenceClient(
            token=HF_API_KEY, 
            timeout=300.0,
            provider="fal-ai" 
        )
    except Exception as client_init_error:
        print(f"Error initializing AsyncInferenceClient with provider='fal-ai': {client_init_error}")
        return None
    
    try:
        # returns bytes for video
        # Pass model explicitly here as per documentation/snippet
        video_bytes = await client.text_to_video(prompt, model=HF_VIDEO_MODEL)
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
    audio_segments: List[str] 
    image_urls: List[str] 
    video_url: str 
    
    # Status
    status: str 
    logs: Annotated[List[str], operator.add]
    errors: List[str]

# Data Models for Structured Output
class ArticleMetadata(BaseModel):
    headline: str = Field(description="A catchy, click-worthy headline (max 10 words)")
    summary: str = Field(description="A concise summary for Twitter (max 280 chars)")
    image_prompt: str = Field(description="A visual description for a cover image")
    tags: List[str] = Field(description="List of 5-7 relevant hashtags (e.g. #DataEngineering)")

class VideoScript(BaseModel):
    sentences: List[str] = Field(description="List of 4-6 engaging sentences for the video script")
    visuals: List[str] = Field(description="List of visual prompts corresponding to each sentence")

# --- Nodes ---

async def content_strategist_node(state: MarketingState):
    """
    Agent 1: Content Strategist & Writer.
    Uses ChatGroq to draft article and extract metadata via LCEL.
    """
    logs = []
    topic = state["topic"]
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
    
    parser = JsonOutputParser(pydantic_object=VideoScript)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a Visual Director for Tech Videos."),
        ("human", "Create a 30s YouTube Short script about: '{headline}'. Returns JSON with 'sentences' and 'visuals'.\n{format_instructions}")
    ])
    
    chain = prompt | llm | parser
    
    script = []
    new_prompts = []
    
    try:
        data = await chain.ainvoke({
            "headline": headline, 
            "format_instructions": parser.get_format_instructions()
        })
        
        # Ensure data is a dict
        if isinstance(data, dict):
             script = data.get("sentences", [])
             new_prompts = data.get("visuals", [])
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
    
    return {
        "script": script,
        "image_prompts": all_prompts,
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
        
        img_bytes = await generate_image_hf(cover_prompt)
        if img_bytes:
        try:
            filename = f"cover_{hash(cover_prompt)}.jpg"
            img_url = upload_to_azure(img_bytes, filename, "image/jpeg")
            if "mock-storage.com" in img_url:
                 # Check if the mock is due to an error, we should probably record that
                 # But upload_to_azure already prints the error.
                 logs.append(f"Azure Upload Failed for Image, using mock: {img_url}")
            else:
                 image_urls.append(img_url) 
                 logs.append(f"Cover image uploaded: {img_url}")
        except Exception as e:
            logs.append(f"Error uploading image: {e}")
            image_urls.append("https://via.placeholder.com/800x400")
    else:
        logs.append("Failed to generate cover image.")
    
    # 2. Generate Video using Wan2.1
    video_prompt = "Cinematic " + state["headline"] + ", " + (state["script"][0] if state["script"] else "Data visualization")
    video_bytes = await generate_video_hf(video_prompt)
    
    video_url = ""
    
    if video_bytes:
        try:
            filename = f"video_{hash(video_prompt)}.mp4"
            video_url = upload_to_azure(video_bytes, filename, "video/mp4")
            if video_url and "mock-storage.com" in video_url:
                logs.append("Azure Upload failed (returned mock URL).")
                video_url = None
            else:
                 logs.append(f"Video uploaded: {video_url}")
        except Exception as e:
            logs.append(f"Error uploading video: {e}")
            video_url = None
    else:
        logs.append(f"Model {HF_VIDEO_MODEL} busy/unavailable or generation failed.")
        video_url = None
    
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
    headline = state['headline']
    summary = state['summary']
    tags_list = state.get("tags", ["#DataEngineering", "#Tech"])
    tags_str = " ".join(tags_list)
    
    # Get Public URLs
    cover_url = state['image_urls'][0] if state.get('image_urls') else "https://via.placeholder.com/800x400"
    video_url = state.get('video_url', "https://example.com/video.mp4")
    
    # 1. Dev.to (Blog)
    # Use the dedicated 'cover_image' field for the hero image
    article_md = state['article_content']
    
    if DEVTO_API_KEY:
        try:
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
                            "tags": tags_list
                        }
                    }
                )
                if resp.status_code in [200, 201]:
                    logs.append(f"Published article to Dev.to: {resp.json().get('url')}")
                else:
                    logs.append(f"Dev.to Error {resp.status_code}: {resp.text}")
        except Exception as e:
            logs.append(f"Dev.to Exception: {e}")
    else:
        logs.append(f"Published article to Dev.to with cover image (Mock): {cover_url[:30]}...")
    
    # 2. Twitter (Summary)
    tweet = f"{headline}\n\n{summary}\n\n{tags_str}\n\nWatch here: {video_url}"
    
    # Temporarily commented out for testing
    # if tweepy and os.getenv("TWITTER_API_KEY"):
    #     try:
    #         # client = tweepy.Client(...)
    #         # client.create_tweet(text=tweet)
    #         logs.append("Posted REAL tweet via Tweepy.")
    #     except Exception as e:
    #         logs.append(f"Tweepy Error: {e}")
    # else:
    logs.append(f"Posted to Twitter (Mock/Disabled): {tweet[:50]}...")
    
    # 3. Instagram (Reel + Image)
    # Instagram Graph API requires a public VIDEO URL for reels, which we now have.
    # No standard python client, using direct Graph API calls via httpx
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
    #                     logs.append("Posted Reel to Instagram successfully.")
    #                 else:
    #                     logs.append(f"IG Publish Error: {pub_res.text}")
    #             else:
    #                 logs.append(f"IG Upload Error: {res.text}")
    #     except Exception as e:
    #         logs.append(f"Instagram API Error: {e}")
    # else:
    logs.append(f"Posted Reel to Instagram (Mock/Disabled): {video_url[:30]}...")
    
    # 4. YouTube Shorts
    # Using google-api-python-client
    # if build and YOUTUBE_API_KEY:
    #     try:
    #         # In production, this requires OAuth flow (pickle/json creds), not just API Key for uploads
    #         # Assuming 'youtube_creds.json' exists or environment variables for OAuth
    #         # youtube = build("youtube", "v3", credentials=...)
    #         logs.append("YouTube Upload Skipped: OAuth credentials required for upload.")
    #     except Exception as e:
    #          logs.append(f"YouTube Error: {e}")
    # else:
    logs.append(f"Uploaded YouTube Short from URL (Mock/Disabled): {video_url}")
    
    return {
        "status": "finished",
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

