
import os
import asyncio
import httpx
from typing import List, Dict, Any, Optional, TypedDict, Annotated
import operator
import json
import shutil
import tempfile
import subprocess

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

# Internal Service Clients
# Internal Service Clients
try:
    # Try relative import first (for package execution)
    from .clients import generate_music_track
except ImportError:
    try:
        # Try absolute/direct import (for script execution)
        from clients import generate_music_track
    except ImportError:
        # Still failing? Check if we are running from root
        try:
            from services.api_gateway.clients import generate_music_track
        except ImportError:
            print("CRITICAL: Could not import generate_music_track.")
            raise

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
# Switching to Image-to-Video workflow.
# We will generate frames using Flux, then animate them using Wan2.1-I2V.
# Fal.ai / HF routing usually exposes "Wan-AI/Wan2.1-I2V-14B-480P" or similar for I2V.
HF_I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B" 
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

def combine_audio_video(video_bytes: bytes, audio_bytes: bytes, target_duration: int = 30) -> Optional[bytes]:
    """
    Combines video and audio bytes using ffmpeg.
    Loops the 5s video input to match the target duration (30s).
    """
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_video:
            temp_video.write(video_bytes)
            video_path = temp_video.name
            
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_audio:
            temp_audio.write(audio_bytes)
            audio_path = temp_audio.name
            
        output_path = video_path.replace(".mp4", "_final.mp4")
        
        # ffmpeg complex filter to loop video
        # stream_loop -1 loops infinitely
        # -t 30 cuts it at 30 seconds
        
        command = [
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-i", video_path, # Loop video input
            "-i", audio_path,                       # Audio input
            "-map", "0:v", "-map", "1:a",
            "-c:v", "copy",                         # Copy video codec (efficient)
            "-c:a", "aac",                          # Encode audio if needed
            "-t", str(target_duration),             # Enforce total duration
            "-shortest",                            # Stop if audio is shorter (though we set audio for 30s)
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
        return video_bytes

async def generate_video_from_image(image_bytes: bytes, prompt: str) -> Optional[bytes]:
    """Generates a video from an image using Wan2.1-I2V (Fal AI via HF)."""
    if not AsyncInferenceClient or not HF_API_KEY:
        print("Error: HF_API_KEY missing.")
        return None

    try:
        # Save image to temp file because HF client usually expects path or URL for I2V, or PIL image
        import io
        from PIL import Image
        pil_image = Image.open(io.BytesIO(image_bytes))

        # Use synchronous client for stability with large media tasks
        client = InferenceClient(api_key=HF_API_KEY, provider="fal-ai")
        
        loop = asyncio.get_running_loop()
        print(f"Animating image with prompt: {prompt[:30]}...")
        
        # The text_to_video method in HF library is overloaded. 
        # For actual I2V, we often need to use specific endpoints or the 'image_to_video' method if available.
        # However, standard HF InferenceClient might wrap it. Let's try the generic 'image_to_video'.
        
        video_bytes = await asyncio.wait_for(
            loop.run_in_executor(
                None, 
                lambda: client.image_to_video(image=pil_image, prompt=prompt, model=HF_I2V_MODEL)
            ), 
            timeout=300.0
        )
        return video_bytes
    except Exception as e:
        print(f"I2V Generation Error ({HF_I2V_MODEL}): {e}")
        return None

def get_video_duration(path: str) -> float:
    """Returns the duration of a video file in seconds."""
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        return float(result.stdout.strip())
    except Exception:
        return 5.0 # Fallback default

def stitch_video_clips(video_clips: list[bytes], audio_bytes: Optional[bytes] = None) -> Optional[bytes]:
    """Stitches multiple video clips with smooth crossfade transitions."""
    if not video_clips:
        return None

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            # Write video clips
            clip_paths = []
            durations = []
            for i, clip in enumerate(video_clips):
                path = os.path.join(tmpdir, f"clip_{i}.mp4")
                with open(path, "wb") as f:
                    f.write(clip)
                clip_paths.append(path)
                durations.append(get_video_duration(path))
            
            # Write audio IF provided
            audio_path = None
            if audio_bytes:
                audio_path = os.path.join(tmpdir, "audio.wav")
                with open(audio_path, "wb") as f:
                    f.write(audio_bytes)

            output_path = os.path.join(tmpdir, "final_output.mp4")
            merged_video_path = os.path.join(tmpdir, "merged_video.mp4")
            
            # --- Build XFADE Filter Graph ---
            # If we only have 1 clip, just copy it
            if len(clip_paths) == 1:
                shutil.copy(clip_paths[0], merged_video_path)
            else:
                inputs = []
                filter_complex = ""
                transition_duration = 1.0 # 1 second crossfade
                
                # Build input list
                for path in clip_paths:
                    inputs.extend(["-i", path])
                
                # Build filter graph
                # stream 0 and 1 -> xfade -> v0
                # v0 and 2 -> xfade -> v1 ...
                
                offset = 0.0
                prev_stream = "0:v"
                
                for i in range(1, len(clip_paths)):
                    # Calculate offset for this transition
                    # Offset is the cumulative duration of previous clips minus the overlap accumulation
                    # Actually, easier: Offset = end of previous clip - transition duration.
                    # Duration of first clip is D0. Offset = D0 - 1.
                    # Result duration = D0 + D1 - 1.
                    # Next offset = (D0 + D1 - 1) + D2 - 1 ... no wait.
                    
                    # Correct logic for N inputs:
                    # Input 1 (duration D0) starts at 0.
                    # Input 2 (duration D1) starts at D0 - T.
                    # Input 3 indicates start at (D0 - T) + (D1 - T) = D0 + D1 - 2T? No.
                    
                    # Let's track the "current end time" of the growing stream.
                    if i == 1:
                        offset = durations[0] - transition_duration
                    else:
                        # Add duration of the PREVIOUS clip to the offset, minus transition overlap
                        offset += durations[i-1] - transition_duration
                    
                    next_stream = f"{i}:v"
                    target_stream = f"v{i}" if i < len(clip_paths) - 1 else "outv"
                    
                    filter_complex += f"[{prev_stream}][{next_stream}]xfade=transition=fade:duration={transition_duration}:offset={offset}[{target_stream}];"
                    prev_stream = target_stream
                
                # Remove trailing semicolon
                filter_complex = filter_complex.rstrip(";")
                
                print(f"Applying XFADE with filter: {filter_complex}")
                
                concat_cmd = [
                    "ffmpeg", "-y",
                    *inputs,
                    "-filter_complex", filter_complex,
                    "-map", f"[outv]",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", # Re-encode for compatibility
                    merged_video_path
                ]
                
                subprocess.run(concat_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            
            # 2. Add Audio (loop audio if shorter, cut video if longer)
            if audio_path:
                final_cmd = [
                    "ffmpeg", "-y",
                    "-i", merged_video_path,
                    "-stream_loop", "-1", "-i", audio_path, # Loop audio
                    "-map", "0:v", "-map", "1:a",
                    "-c:v", "copy", "-c:a", "aac",
                    "-shortest", # End when the shortest stream ends
                    output_path
                ]
            else:
                final_cmd = [
                    "ffmpeg", "-y",
                    "-i", merged_video_path,
                    "-c", "copy",
                    output_path
                ]
            
            # Use check=False to capture result and ignore non-fatal exit codes
            result = subprocess.run(final_cmd, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


            
            # If output exists and is non-zero, we consider it a success
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                with open(output_path, "rb") as f:
                    return f.read()
            else:
                 # Check for specific errors
                 stderr_out = result.stderr.decode('utf-8')
                 print(f"Stitch Error Output: {stderr_out}")
                 
                 # If audio failed stitching, return silent video as fallback
                 if os.path.exists(merged_video_path) and os.path.getsize(merged_video_path) > 0:
                     print("Stitching Fallback: Returning silent video (merged_video.mp4).")
                     with open(merged_video_path, "rb") as f:
                        return f.read()
                 
                 # Only raise if output is missing
                 raise Exception(f"FFmpeg failed (Exit {result.returncode}): {stderr_out}")
                
    except Exception as e:
        print(f"Stitch Error: {e}")
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
    sentences: List[str] = Field(
        description="List of 4-6 engaging sentences for the voiceover script (total duration ~30s)"
    )
    visuals: List[str] = Field(
        description="List of visual concepts corresponding to each sentence to guide the video editor"
    )
    video_prompt: str = Field(
        description=(
            "A highly descriptive, natural language prompt for a 5-second cinematic background video loop. "
            "CRITICAL REQUIREMENTS:\n"
            "1. SCENE: An empty, minimalist 3D environment related to the topic. No people, no text, no logos.\n"
            "2. VISUAL STYLE: Distinctive, cinematic, high-end commercial aesthetic. "
            "Use varied color palettes appropriate for the subject (e.g., warm oranges for cloud, cool teals for data, bright neons for AI). Avoid generic black.\n"
            "3. MOTION: A slow, continuous, elegant camera pan. Smooth and fluid.\n"
            "4. QUALITY: Photorealistic, Unreal Engine 5 render style, 8k resolution, photorealistic textures (glass, metal, light).\n"
            "5. FORMAT: Write as a flowing, descriptive paragraph, not a list of keywords."
        )
    )

class VisualDirectives(BaseModel):
    prompts: List[str] = Field(
        description="A list of exactly 4 highly detailed, cinematic image generation prompts for a video sequence. "
                    "Each prompt must be distinct (Title Card, Detail Shot, Abstract Shot, Closing Branding). "
                    "Focus on elegance, minimalism, and high-end tech aesthetic."
    )

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
        ("human", """Article: {article}

        {format_instructions}

        Provide:
        1. A catchy Headline
        2. A concise Summary for Twitter
        3. 5-7 relevant Hashtags
        4. A vivid, high-quality Image Prompt for a cover image. It should be cinematic, 8k resolution, and specifically describe the lighting and materials related to the topic. Avoid generic "tech blue" backgrounds. Use complementary colors and dynamic composition.""")
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
    
    # prompt = ChatPromptTemplate.from_messages([
    #     ("system", "You are a Visual Director for Tech Videos. Ensure all text in video prompts is in English and spelled correctly."),
    #     ("human", "Create a 30s YouTube Short script (voiceover) about: '{headline}'. \nContext/Summary: {summary}\nReturns JSON with 'sentences' (for voiceover), 'visuals' (for reference), and a single high-quality 'video_prompt' for generating a 5s abstract background video loop. \nVideo Prompt must include: Kinetic Typography of Headline, Databro Logo, Topic Icons, Social Media Icons (Twitter/YT/IG) at end. NO PEOPLE.\n{format_instructions}")
    # ])
    

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an elite Visual Director for high-end Tech Commercials. Your job is to design stunning, cinematic video backgrounds that capture the essence of the topic."),
        ("human", """Create a 30s YouTube Short script (voiceover) about: '{headline}'. 
    Context/Summary: {summary}

    Return JSON with 'sentences' (for voiceover), 'visuals' (for reference), and a single high-quality 'video_prompt'.

    The 'video_prompt' MUST be for a clean, abstract, text-free background loop related to the topic. 
    Make it visually distinct and creative. Avoid generic tech blues if possible. Use shallow depth of field, 8k resolution, photorealistic textures (glass, metal, light), and dynamic lighting.
    
    DO NOT ask for text, logos, or UI elements in the video generation. It must be a background.
    
    {format_instructions}""")
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
    
    # 2. Generate Video Sequence (Image-to-Video Workflow)
    headline = state.get("headline", "Tech Update")
    summary = state.get("summary", "")
    
    # Dynamic Prompt Generation using LLM (replacing hardcoded templates)
    logs.append(f"Generating dynamic visual directives for: {headline}")
    
    prompt_gen_prompt = ChatPromptTemplate.from_messages([
        ("system", """You are a Hollywood Art Director specializing in high-end tech commercials.
        Your task is to write 4 distinct, highly detailed, photorealistic image generation prompts for a video sequence.
        
        Style Guide:
        - Cinematic, 8k resolution, Unreal Engine 5 render, volumetrics, dynamic lighting.
        - Avoid generic "tech blue" or simple black backgrounds. Use rich, deep colors appropriate for the topic (e.g., warm data centers, cool server rooms, vibrant cyber cities).
        - High contrast, sharp focus, depth of field.
        
        The 4 prompts must be:
        1. **Title Card**: A stunning, complex 3D background related to '{topic}' (e.g. a sprawling detailed data center, a glowing neural network, a futuristic city). In the center, large, bold, glowing white sans-serif text reading "{headline}". The text must be legible but integrated into the scene.
        2. **Detail Shot**: A macro close-up of a relevant tech object (e.g. server rack, microchip, fiber optic, data stream) related to the summary: "{summary}". No text.
        3. **Abstract Shot**: A beautiful, abstract 3D visualization of data processing or AI. High complexity, glass and metal textures. No text.
        4. **Closing Shot**: A professional, high-end studio background (dark grey/navy gradient). Large, clean, white 3D sans-serif text reading "Databro" in the center AND smaller text "databro.dev" at the bottom.
        
        Return ONLY a JSON list of 4 strings."""),
        ("human", "Generate the 4 visual prompts now.")
    ])
    
    parser = JsonOutputParser(pydantic_object=VisualDirectives)
    chain = prompt_gen_prompt | llm | parser
    
    keyframe_prompts = []
    try:
        data = await chain.ainvoke({"headline": headline, "summary": summary, "topic": state.get("topic", "Technology")})
        keyframe_prompts = data.get("prompts", [])
        logs.append(f"LLM Generated {len(keyframe_prompts)} prompts.")
    except Exception as e:
        logs.append(f"Prompt Gen Error: {e}. Using fallback.")
    
    # Fallback if LLM fails
    if not keyframe_prompts or len(keyframe_prompts) < 4:
        keyframe_prompts = [
            f"Cinematic 3D render of a futuristic data center with glowing servers. In the center, large bold white text reads: '{headline}'. Volumetric lighting, 8k resolution, detailed background.",
            "Close up macro shot of digital data stream, glowing blue particles, depth of field, complex texture.",
            "Abstract geometric shapes rotating in void, glass texture, high end commercial style, colorful lighting.",
            "Dark professional studio background. Large, clean, white 3D sans-serif text reading 'Databro' in the center. Small text 'databro.dev' at bottom. Professional logo design, sharp focus."
        ]
    
    video_clips = []
    logs.append(f"Starting Multi-Shot Video Generation with {len(keyframe_prompts)} prompts...")
    
    # Generate clips sequentially
    import uuid
    
    generated_asset_urls = []

    for i, p in enumerate(keyframe_prompts):
        logs.append(f"Generating Keyframe {i+1}: {p[:30]}...")
        # Reuse existing image gen function
        img_bytes = await generate_image_hf(p)
        
        if img_bytes:
            # Upload Keyframe Immediately
            kf_filename = f"keyframe_{i}_{uuid.uuid4().hex[:8]}.jpg"
            kf_url = upload_to_azure(img_bytes, kf_filename, "image/jpeg")
            if kf_url:
                logs.append(f"Keyframe {i+1} uploaded: {kf_url}")
                generated_asset_urls.append(kf_url)
            
            # Animate it
            logs.append(f"Animating Keyframe {i+1}...")
            # Simple motion prompt for I2V
            motion_prompt = "Slow smooth camera pan, cinematic lighting, 4k, high quality, slow motion"
            
            # Using the new I2V function
            clip_bytes = await generate_video_from_image(img_bytes, motion_prompt)
            if clip_bytes:
                video_clips.append(clip_bytes)
                logs.append(f"Clip {i+1} generated successfully ({len(clip_bytes)} bytes).")
                
                # Upload Video Clip Immediately
                clip_filename = f"clip_{i}_{uuid.uuid4().hex[:8]}.mp4"
                clip_url = upload_to_azure(clip_bytes, clip_filename, "video/mp4")
                if clip_url:
                    logs.append(f"Clip {i+1} uploaded: {clip_url}")
                    generated_asset_urls.append(clip_url)
            else:
                 logs.append(f"Failed to animate Keyframe {i+1}")
        else:
             logs.append(f"Failed to generate Keyframe {i+1} image")

    video_url = None
    
    if video_clips:
        # --- Audio Generation & Stitching ---
        logs.append(f"Generating matching audio. We have {len(video_clips)} clips.")
        audio_prompt = "Upbeat, futuristic tech background music, looping, synthesizer, high quality"
        
        audio_bytes = None
        try:
            # Generate 30s of audio 
            print("Invoking generate_music_track...") 
            audio_bytes = await generate_music_track(prompt=audio_prompt, duration=30)

            # Upload Audio immediately if successful
            # NOTE: generate_music_track now guarantees a valid WAV file via ffmpeg conversion
            if audio_bytes and len(audio_bytes) > 1000:
                audio_filename = f"audio_{uuid.uuid4().hex[:8]}.wav"
                audio_url = upload_to_azure(audio_bytes, audio_filename, "audio/wav")
                if audio_url:
                    logs.append(f"Audio track uploaded (.wav): {audio_url}")
                    generated_asset_urls.append(audio_url)
            elif audio_bytes:
                 logs.append("Audio generated but too small (<1KB). Discarding.")
                 audio_bytes = None # Discard small/invalid files
                    
        except Exception as audio_e:
             logs.append(f"Audio Processing Error: {audio_e}")

        # Stitching Logic (With or Without Audio)
        if audio_bytes:
            logs.append("Audio generated. Stitching clips...")
        else:
            logs.append("Audio generation failed/skipped. Stitching SILENT video...")
            # Create a silent dummy audio track of 30s to allow stitching logic to proceed?
            # Or modify stitch_video_clips to handle None audio. 
            # For now, let's keep it simple: if audio fails, we still want the stitched video.
            # We'll need to update stitch_video_clips to handle missing audio, or just skip audio add.
            # Let's just create a silent wave or handle it in stitcher.
            # Actually, easiest is to just proceed with what we have.
        
        if video_clips:
             try:
                # If audio failed, we still want to generate a silent video
                # 'stitch_video_clips' handles None audio now.
                logs.append("Stitching video clips...")
                
                loop = asyncio.get_running_loop()
                combined_bytes = await loop.run_in_executor(
                    None, 
                    lambda: stitch_video_clips(video_clips, audio_bytes)
                )

                if combined_bytes:
                    video_bytes = combined_bytes
                    logs.append("Final video stitched successfully.")
                    
                    # Upload
                    import hashlib
                    start_hash = hashlib.md5(headline.encode()).hexdigest()
                    filename = f"video_final_{start_hash}.mp4"
                    
                    video_url = upload_to_azure(video_bytes, filename, "video/mp4")
                    if video_url:
                        logs.append(f"Video uploaded successfully: {video_url}")
                    else:
                        logs.append("Error: Azure Upload Failed for Final Video.")
             except Exception as stitch_e:
                 logs.append(f"Stitching Error: {stitch_e}")
    else:
        logs.append("Error: No video clips were generated successfully.")

    logs.append(f"Generated Image URLs: {image_urls}")
    logs.append(f"Generated Intermediate Assets: {generated_asset_urls}")
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