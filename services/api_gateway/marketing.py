
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
    from azure.storage.blob import BlobServiceClient
except ImportError:
    BlobServiceClient = None

try:
    import tweepy
except ImportError:
    tweepy = None

try:
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseUpload
except ImportError:
    build = None

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
    if not AZURE_STORAGE_CONN_STR or not BlobServiceClient:
        print("Azure Storage not configured or library missing.")
        return f"https://mock-storage.com/{filename}"
        
    try:
        blob_service_client = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONN_STR)
        blob_client = blob_service_client.get_blob_client(container=CONTAINER_NAME, blob=filename)
        
        blob_client.upload_blob(data, overwrite=True, content_settings={"content_type": content_type})
        return blob_client.url
    except Exception as e:
        print(f"Azure Upload Error: {e}")
        return f"https://mock-storage.com/{filename}"

# --- Media Generation (Custom Wrappers) ---
# Keeping these as async utility functions as LangChain doesn't have standard T2V tools yet

async def generate_image_hf(prompt: str) -> Optional[bytes]:
    """Generates an image using Hugging Face Inference API."""
    if not HF_API_KEY:
        print("Error: HF_API_KEY not set.")
        return None
        
    headers = {"Authorization": f"Bearer {HF_API_KEY}"}
    # Using the new router endpoint as api-inference is deprecated
    api_url = f"https://router.huggingface.co/hf-inference/models/{HF_IMAGE_MODEL}"
    
    # Increase timeout to 120s as image generation can sometimes be slow
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(api_url, json={"inputs": prompt}, headers=headers)
            if resp.status_code != 200:
                print(f"HF Error {resp.status_code}: {resp.text}")
                return None
            return resp.content
        except Exception as e:
            print(f"HF Gen Error: {e}")
            return None

async def generate_video_hf(prompt: str) -> Optional[bytes]:
    """
    Generates a video using Hugging Face Inference API for Wan2.1-T2V-1.3B.
    This model generates a short video clip from a text prompt.
    """
    if not HF_API_KEY:
        print("Error: HF_API_KEY not set.")
        return None
        
    headers = {"Authorization": f"Bearer {HF_API_KEY}"}
    # Using the new router endpoint as api-inference is deprecated
    api_url = f"https://router.huggingface.co/hf-inference/models/{HF_VIDEO_MODEL}"
    
    print(f"Generating video for: '{prompt[:50]}...' using {HF_VIDEO_MODEL}")
    
    # Increase timeout to 300s (5 mins) as video generation is very slow
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            # Video generation can take time, increasing timeout
            resp = await client.post(api_url, json={"inputs": prompt}, headers=headers)
            
            if resp.status_code == 503:
                 print(f"HF Error 503 (Model Loading): {resp.text}")
                 # Could retry here, but for now just fail gracefully
                 return None
                 
            if resp.status_code != 200:
                print(f"HF Error {resp.status_code}: {resp.text}")
                return None
            return resp.content
        except Exception as e:
            print(f"HF Video Gen Error: {e}")
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
            filename = f"cover_{hash(cover_prompt)}.jpg"
            img_url = upload_to_azure(img_bytes, filename, "image/jpeg")
            image_urls.append(img_url) 
            logs.append(f"Cover image uploaded: {img_url}")
        else:
            logs.append("Failed to generate cover image.")
    
    # 2. Generate Video using Wan2.1
    video_prompt = "Cinematic " + state["headline"] + ", " + (state["script"][0] if state["script"] else "Data visualization")
    video_bytes = await generate_video_hf(video_prompt)
    
    video_url = ""
    
    if video_bytes:
        filename = f"video_{hash(video_prompt)}.mp4"
        video_url = upload_to_azure(video_bytes, filename, "video/mp4")
        logs.append(f"Video uploaded: {video_url}")
    else:
        logs.append(f"Model {HF_VIDEO_MODEL} busy/unavailable. Fallback to mock.")
        video_url = "https://mock-storage.com/dummy_video_fallback.mp4"
    
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

