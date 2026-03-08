import os
import asyncio
import httpx
import tempfile
import subprocess
import io
import json
import uuid
import operator
import base64
import numpy as np
from typing import List, Dict, Any, Optional, TypedDict, Annotated

from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageOps

try:
    from moviepy.editor import ImageSequenceClip, concatenate_videoclips, AudioFileClip, CompositeAudioClip
except ImportError:
    ImageSequenceClip = None

try:
    from azure.storage.blob import BlobServiceClient, ContentSettings
except ImportError as e:
    BlobServiceClient = None

try:
    from huggingface_hub import AsyncInferenceClient
except ImportError:
    AsyncInferenceClient = None

# --- Config ---
HF_API_KEY = os.getenv("HF_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
AZURE_STORAGE_CONN_STR = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
DEVTO_API_KEY = os.getenv("DEVTO_API_KEY")
CONTAINER_NAME = "marketing-assets"

# Models and Endpoints
HF_IMAGE_MODEL = "black-forest-labs/FLUX.1-schnell"
ANIMATEDIFF_ENDPOINT = os.getenv("ANIMATEDIFF_ENDPOINT", "https://b1hys638z2sej8wx.us-east-1.aws.endpoints.huggingface.cloud")
MUSICGEN_ENDPOINT = os.getenv("MUSICGEN_ENDPOINT", "https://api-inference.huggingface.co/models/facebook/musicgen-small")

OUTPUT_DIR = "/tmp/marketing_slides"
os.makedirs(OUTPUT_DIR, exist_ok=True)
SLIDE_SIZE = (1080, 1920)

llm = ChatGroq(
    temperature=0.7,
    model_name="llama-3.2-90b-text-preview",
    groq_api_key=GROQ_API_KEY
)

def upload_to_azure(filepath: str, filename: str, content_type: str) -> Optional[str]:
    if not AZURE_STORAGE_CONN_STR or not BlobServiceClient: return None
    try:
        blob_service_client = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONN_STR)
        blob_client = blob_service_client.get_blob_client(container=CONTAINER_NAME, blob=filename)
        with open(filepath, "rb") as data:
            blob_client.upload_blob(data, overwrite=True, content_settings=ContentSettings(content_type=content_type))
        return blob_client.url
    except Exception as e:
        print(f"Azure upload error: {e}")
        return None

import io
import httpx

# --- FONT CACHE ---
_FONT_CACHE: Dict[str, bytes] = {}

async def create_text_layer(text: str, icon_name: str | None = None, size=SLIDE_SIZE) -> Image.Image:
    text_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(text_layer)
    fonts_to_download = {
        "Orbitron": "https://github.com/google/fonts/raw/main/ofl/orbitron/Orbitron%5Bwght%5D.ttf",
        "Poppins-Bold": "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf",
        "Poppins-Medium": "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Medium.ttf",
        "Poppins-Regular": "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Regular.ttf",
        "Poppins-SemiBold": "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-SemiBold.ttf",
    }
    
    font = None
    logo_font = None
    
    try:
        async with httpx.AsyncClient() as client:
            # Load main font
            if "Poppins-Bold" not in _FONT_CACHE:
                font_response = await client.get(fonts_to_download["Poppins-Bold"])
                if font_response.status_code == 200:
                    _FONT_CACHE["Poppins-Bold"] = font_response.content
            if "Poppins-Bold" in _FONT_CACHE:
                font = ImageFont.truetype(io.BytesIO(_FONT_CACHE["Poppins-Bold"]), 80)
                
            # Load logo font
            if "Orbitron" not in _FONT_CACHE:
                logo_response = await client.get(fonts_to_download["Orbitron"])
                if logo_response.status_code == 200:
                    _FONT_CACHE["Orbitron"] = logo_response.content
            if "Orbitron" in _FONT_CACHE:
                logo_font = ImageFont.truetype(io.BytesIO(_FONT_CACHE["Orbitron"]), 45)
    except Exception as e:
        print(f"Font fetching error: {e}")
        
    if font is None:
        font = ImageFont.load_default()
    if logo_font is None:
        logo_font = ImageFont.load_default()
        
    lines = []
    words = text.split()
    current_line = []
    
    for word in words:
        current_line.append(word)
        line_w = draw.textlength(" ".join(current_line), font=font) if hasattr(draw, 'textlength') else 50 * len(current_line)
        if line_w > size[0] * 0.8:
            lines.append(" ".join(current_line[:-1]))
            current_line = [word]
    if current_line:
        lines.append(" ".join(current_line))
        
    h_offset = size[1] // 2 - (len(lines) * 100) // 2
    for line in lines:
        line_w = draw.textlength(line, font=font) if hasattr(draw, 'textlength') else 50 * len(line)
        x = (size[0] - line_w) // 2
        draw.text((x, h_offset), line, fill=(255, 255, 255, 255), font=font, stroke_width=4, stroke_fill=(0, 0, 0, 255))
        h_offset += 100
        
    # Generate databro.dev Logo at bottom
    logo_text = "databro.dev"
    logo_w = draw.textlength(logo_text, font=logo_font) if hasattr(draw, 'textlength') else 30 * len(logo_text)
    logo_x = (size[0] - logo_w) // 2
    logo_y = size[1] - 100
    
    # "Embossed" look simulation
    draw.text((logo_x + 2, logo_y + 2), logo_text, fill=(0, 0, 0, 180), font=logo_font)
    draw.text((logo_x - 1, logo_y - 1), logo_text, fill=(255, 255, 255, 120), font=logo_font)
    draw.text((logo_x, logo_y), logo_text, fill=(210, 210, 210, 255), font=logo_font)
    
    # Download and overlay icon
    if icon_name:
        icon_url = f"https://img.icons8.com/ios-glyphs/120/ffffff/{icon_name.lower().replace(' ', '-')}.png"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(icon_url)
                if response.status_code == 200:
                    icon_img = Image.open(io.BytesIO(response.content)).convert("RGBA")
                    icon_w, icon_h = icon_img.size
                    icon_x = (size[0] - icon_w) // 2
                    icon_y = size[1] // 2 - (len(lines) * 100) // 2 - icon_h - 40
                    text_layer.alpha_composite(icon_img, (icon_x, icon_y))
            except Exception as e:
                print(f"Failed to fetch or add icon {icon_name}: {e}")
                
    return text_layer

# --- MODEL CALLS ---
import functools

def async_exponential_backoff(retries=5, base_delay=2.0):
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            for i in range(retries + 1):
                try:
                    result = await func(*args, **kwargs)
                    if result:  # True for non-empty bytes, valid response structures
                        return result
                    error_msg = "returned empty or None"
                except Exception as e:
                    error_msg = str(e)
                
                if i < retries:
                    delay = base_delay * (2 ** i)
                    print(f"[{func.__name__}] Call failed ({error_msg}). Retrying in {delay}s ...")
                    await asyncio.sleep(delay)
                else:
                    print(f"[{func.__name__}] Max retries exceeded.")
                    
            return [] if 'animate' in func.__name__ else None
        return wrapper
    return decorator

@async_exponential_backoff(retries=5, base_delay=4.0)
async def generate_image_hf(prompt: str) -> Optional[bytes]:
    if not AsyncInferenceClient or not HF_API_KEY: return None
    client = AsyncInferenceClient(token=HF_API_KEY, timeout=120.0)
    try:
        image = await client.text_to_image(prompt, model=HF_IMAGE_MODEL, width=720, height=1280)
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='JPEG')
        return img_byte_arr.getvalue()
    except Exception as e:
        print(f"HF Image gen error: {e}")
        raise e

@async_exponential_backoff(retries=5, base_delay=4.0)
async def animate_image_hf(prompt: str) -> List[Image.Image]:
    headers = {"Authorization": f"Bearer {HF_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "inputs": prompt,
        "parameters": {
            "num_frames": 16,
            "width": 512,
            "height": 896,
            "guidance_scale": 1.0,
            "num_inference_steps": 4,
            "output_format": "frames"
        }
    }
    
    async with httpx.AsyncClient(timeout=180.0) as client:
        try:
            resp = await client.post(ANIMATEDIFF_ENDPOINT, headers=headers, json=payload)
            if resp.status_code != 200:
                print(f"Animate error: {resp.text}")
                raise Exception(f"HTTP {resp.status_code}: {resp.text}")
                
            result = resp.json()
            frames = []
            if "frames" in result:
                for frame_b64 in result["frames"]:
                    frame_bytes = base64.b64decode(frame_b64)
                    frames.append(Image.open(io.BytesIO(frame_bytes)).convert("RGB"))
                return frames
            return []
        except Exception as e:
            print(f"Animate connection error: {e}")
            raise e

async def generate_tts_groq(text: str) -> Optional[bytes]:
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": "whisper-1",  # Use an available endpoint proxy mode or TTS if supported natively
        "input": text,
        "voice": "alloy"
    }
    # For now we hit the URL typically used, if not we fallback
    url = "https://api.groq.com/openai/v1/audio/speech"
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                return resp.content
            else:
                print(f"Groq TTS error: {resp.text}")
                return None
        except Exception as e:
            print(f"Groq TTS connection error: {e}")
            return None

@async_exponential_backoff(retries=5, base_delay=4.0)
async def generate_bg_music_hf(prompt: str) -> Optional[bytes]:
    if not HF_API_KEY: return None
    headers = {"Authorization": f"Bearer {HF_API_KEY}"}
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(MUSICGEN_ENDPOINT, headers=headers, json={"inputs": prompt})
            if resp.status_code == 200:
                return resp.content
            else:
                if resp.status_code == 503:
                    print(f"MusicGen cold start 503: {resp.text}")
                else:
                    print(f"MusicGen error: {resp.text}")
                raise Exception(f"HTTP {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"MusicGen connection error: {e}")
            raise e
        print("No DEVTO_API_KEY provided.")
        return None
    
    url = "https://dev.to/api/articles"
    headers = {
        "api-key": DEVTO_API_KEY,
        "Content-Type": "application/json"
    }
    
    # DEV.to takes up to 4 tags
    clean_tags = [t.replace("#", "").strip() for t in tags][:4]
    
    data = {
        "article": {
            "title": title,
            "published": True, # Or False if you just want it as a draft
            "body_markdown": markdown_content,
            "tags": clean_tags,
            "main_image": cover_url
        }
    }
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, headers=headers, json=data)
            if resp.status_code in (200, 201):
                return resp.json().get("url")
            else:
                print(f"DEV.to posting error [{resp.status_code}]: {resp.text}")
                return None
        except Exception as e:
            print(f"DEV.to connection error: {e}")
            return None

class MarketingState(TypedDict):
    topic: str
    slides: List[Dict]
    blog_content: str
    blog_cover_prompt: str
    blog_cover_url: str
    social_tags: List[str]
    devto_url: str
    logs: Annotated[List[str], operator.add]
    video_url: str
    assets: Dict[str, Any]

class SlideData(BaseModel):
    slide_text: str = Field(description="The text displayed on the screen.")
    icon_name: str = Field(description="A single word representing a UI icon for the slide (e.g., 'rocket', 'brain', 'zap', 'chart'). Do not use emojis here, just the english word.")
    voiceover: str = Field(description="The exact voiceover text.")
    image_prompt: str = Field(description="High-quality prompt for FLUX.1 background image.")
    animation_prompt: str = Field(description="Prompt describing the motion for AnimateDiff-Lightning.")
    bg_music_prompt: str = Field(description="Brief text for MusicGen background track.")

class SlideShowScript(BaseModel):
    slides: List[SlideData]
    blog_content: str = Field(description="An engaging, comprehensive, and highly technical blog post in Markdown format for dev.to based on the topic. It must include code snippets where applicable, and a generous, engaging use of emojis (🚀, 💡, 💻) throughout.")
    blog_cover_prompt: str = Field(description="A descriptive prompt for an eye-catching, high-quality blog cover image suitable for dev.to, ready for generation via FLUX.1.")
    social_tags: List[str] = Field(description="A list of 5-10 appropriate, high-ranking tags or hashtags that can be used across various social platforms including dev.to.")

from langchain_core.runnables import RunnableConfig

async def script_agent(state: MarketingState, config: RunnableConfig = None):
    cb = config.get("configurable", {}).get("log_cb") if config else None
    
    def add_log(msg: str):
        logs.append(msg)
        if cb:
            cb(msg)

    topic = state.get("topic", "AI")
    logs = []
    add_log("Generating slide script...")

    
    system = "You are an expert marketing video creator."
    human = f"""
    Create a 5-slide video script about: {topic}.
    1. Slide 1: 'Did you know?' to increase eagerness.
    2. Slide 2: Another 'Did you know?' related to the topic.
    3. Slide 3: Reveal the real topic.
    4. Slide 4: Real important concepts and highlights of the topic.
    5. Slide 5: Closing slide saying exactly: "To know more visit dev.to/ksaraboji".
    
    For each, provide:
    - slide_text: the text displayed on the screen
    - voiceover: what the speaker will say
    - image_prompt: prompt for FLUX background image
    - animation_prompt: prompt for AnimateDiff describing motion and aesthetics
    - bg_music_prompt: brief description of background music for MusicGen
    
    You must also write an engaging, well-structured, and highly technical blog post in Markdown format for dev.to about this topic, ensuring it includes relevant technical explanations, valid code snippets, and a good use of emojis (🚀, 💡, 💻, etc.) throughout to keep the reader engaged. Also, generate an image prompt specifically for the blog post's cover image, and provide a list of highly relevant social tags to promote it.
    """
    
    parser = JsonOutputParser(pydantic_object=SlideShowScript)
    prompt = ChatPromptTemplate.from_messages([("system", system), ("human", human + "\n{format_instructions}")])
    chain = prompt | llm | parser
    
    try:
        script_data = await chain.ainvoke({"format_instructions": parser.get_format_instructions()})
        slides = script_data.get("slides", [])
        blog_content = script_data.get("blog_content", "")
        blog_cover_prompt = script_data.get("blog_cover_prompt", "")
        social_tags = script_data.get("social_tags", [])
        add_log(f"Generated {len(slides)} slides and blog content.")
        return {
            "slides": slides,
            "blog_content": blog_content,
            "blog_cover_prompt": blog_cover_prompt,
            "social_tags": social_tags,
            "assets": {},
            "logs": logs
        }
    except Exception as e:
         add_log(f"Script Error: {e}")
         return {"logs": logs}

async def production_agent(state: MarketingState, config: RunnableConfig = None):
    cb = config.get("configurable", {}).get("log_cb") if config else None
    
    def add_log(msg: str):
        logs.append(msg)
        if cb:
            cb(msg)

    slides = state.get("slides", [])
    blog_cover_prompt = state.get("blog_cover_prompt", "")
    logs = []
    add_log("Producing video assets...")
    
    run_id = str(uuid.uuid4())[:8]
    clips_paths = []
    audio_paths = []
    assets = {}
    blog_cover_url = ""
    
    # Generate Blog Cover Image
    if blog_cover_prompt:
        add_log("Generating blog cover image...")
        cover_bytes = await generate_image_hf(blog_cover_prompt)
        if cover_bytes:
            cover_file = f"{OUTPUT_DIR}/{run_id}_blog_cover.jpg"
            with open(cover_file, "wb") as f:
                f.write(cover_bytes)
            azure_url = upload_to_azure(cover_file, f"{run_id}_blog_cover.jpg", "image/jpeg")
            blog_cover_url = azure_url or cover_file
            assets["blog_cover"] = blog_cover_url
    
    FINAL_FPS = 8
    
    if not ImageSequenceClip:
        add_log("MoviePy not installed. Cannot stitch video.")
        return {"logs": logs}

    music_prompt = slides[0]["bg_music_prompt"] if slides else "upbeat tech electronic background music"
    
    for i, slide in enumerate(slides):
        add_log(f"Processing slide {i+1}...")
        slide_assets = {}
        
        # 1. Base Image from FLUX
        img_bytes = await generate_image_hf(slide["image_prompt"])
        if not img_bytes:
            add_log(f"Failed to generate base image for slide {i+1}")
            continue
            
        base_img_file = f"{OUTPUT_DIR}/{run_id}_slide_{i}_base.jpg"
        with open(base_img_file, "wb") as f:
            f.write(img_bytes)
        slide_assets["base_image"] = upload_to_azure(base_img_file, f"{run_id}_slide_{i}_base.jpg", "image/jpeg") or base_img_file
            
        static_img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
        static_img = ImageOps.fit(static_img, SLIDE_SIZE, method=Image.LANCZOS, centering=(0.5, 0.5))
        
        # Draw dark gradient for readability
        gradient = Image.new("RGBA", SLIDE_SIZE, (0, 0, 0, 0))
        gd = ImageDraw.Draw(gradient)
        for y in range(SLIDE_SIZE[1]):
            alpha = int(0 + (120 - 0) * (y / SLIDE_SIZE[1]))
            gd.line([(0, y), (SLIDE_SIZE[0], y)], fill=(0, 0, 0, alpha))
        static_img = Image.alpha_composite(static_img, gradient)

        # 2. Text overlay layer
        text_layer = await create_text_layer(slide["slide_text"], icon_name=slide.get("icon_name"), size=SLIDE_SIZE)
        
        # 3. Animate the frame natively
        anim_frames = await animate_image_hf(slide["animation_prompt"])
        
        # Composite Animation + Text Overlay
        composited_frames = []
        if not anim_frames:
            # Fallback
            c_img = Image.alpha_composite(static_img, text_layer).convert("RGB")
            for _ in range(16):
                composited_frames.append(np.array(c_img))
        else:
            for frame in anim_frames:
                frame_resized = frame.resize(SLIDE_SIZE, Image.LANCZOS).convert("RGBA")
                frame_processed = Image.alpha_composite(frame_resized, gradient)
                composited = Image.alpha_composite(frame_processed, text_layer)
                composited_frames.append(np.array(composited.convert("RGB")))
        
        # 4. Voiceover
        duration = 3.0
        tts_bytes = await generate_tts_groq(slide["voiceover"])
        if tts_bytes:
            audio_file = f"{OUTPUT_DIR}/{run_id}_slide_{i}.mp3"
            with open(audio_file, "wb") as f:
                f.write(tts_bytes)
            audio_paths.append(audio_file)
            slide_assets["voiceover"] = upload_to_azure(audio_file, f"{run_id}_slide_{i}.mp3", "audio/mpeg") or audio_file
            try:
                temp_audio = AudioFileClip(audio_file)
                duration = temp_audio.duration
                temp_audio.close()
            except:
                pass

        total_frames = int(duration * FINAL_FPS)
        if total_frames <= 0: total_frames = 16
        looped_frames = [composited_frames[j % len(composited_frames)] for j in range(total_frames)]
        
        clip_path = f"{OUTPUT_DIR}/{run_id}_clip_{i}.mp4"
        clip = ImageSequenceClip(looped_frames, fps=FINAL_FPS)
        clip.write_videofile(clip_path, fps=FINAL_FPS, codec="libx264", audio=False, logger=None)
        clips_paths.append(clip_path)
        
        # Uploading animated clip
        slide_assets["animated_clip"] = upload_to_azure(clip_path, f"{run_id}_clip_{i}.mp4", "video/mp4") or clip_path
        assets[f"slide_{i+1}"] = slide_assets

    add_log("Stitching Final Video with FFmpeg via MoviePy...")
    
    music_bytes = await generate_bg_music_hf(music_prompt)
    music_file = None
    if music_bytes:
        music_file = f"{OUTPUT_DIR}/{run_id}_bg_music.mp3"
        with open(music_file, "wb") as f:
            f.write(music_bytes)
        assets["bg_music"] = upload_to_azure(music_file, f"{run_id}_bg_music.mp3", "audio/mpeg") or music_file
            
    final_video_path = f"{OUTPUT_DIR}/{run_id}_final.mp4"
    final_video_url = ""
    if clips_paths:
        try:
            from moviepy.editor import VideoFileClip
            loaded_clips = [VideoFileClip(cp) for cp in clips_paths]
            final_video = concatenate_videoclips(loaded_clips, method="compose")
            
            combined_audio = []
            current_time = 0
            for i, apath in enumerate(audio_paths):
                if os.path.exists(apath):
                    aclip = AudioFileClip(apath).set_start(current_time)
                    combined_audio.append(aclip)
                current_time += loaded_clips[i].duration
                    
            if music_file and os.path.exists(music_file):
                try:
                    bg_clip = AudioFileClip(music_file)
                    import math
                    from moviepy.editor import concatenate_audioclips
                    loops = max(1, math.ceil(final_video.duration / bg_clip.duration))
                    bg_clip = concatenate_audioclips([bg_clip]*loops).set_duration(final_video.duration)
                    bg_clip = bg_clip.volumex(0.3)
                    combined_audio.append(bg_clip)
                except Exception as e:
                    print(f"Error handling bg music: {e}")

            if combined_audio:
                final_audio = CompositeAudioClip(combined_audio)
                final_video = final_video.set_audio(final_audio)

            final_video.write_videofile(final_video_path, fps=FINAL_FPS, codec="libx264", audio_codec="aac", logger=None)
            final_video_url = upload_to_azure(final_video_path, f"{run_id}_final.mp4", "video/mp4") or final_video_path
            assets["final_video"] = final_video_url
            add_log(f"Successfully generated video at: {final_video_url}")
            
        except Exception as e:
            add_log(f"Stitching error: {e}")
            import traceback
            traceback.print_exc()
    else:
        add_log("No clips to stitch.")

    # Post to Dev.to
    topic = state.get("topic", "AI")
    blog_content = state.get("blog_content", "")
    social_tags = state.get("social_tags", [])
    devto_url = ""
    if blog_content:
        add_log("Posting blog to DEV.to...")
        devto_url_resp = await post_to_devto(
            title=f"Exploring {topic}: Deep Dive & Insights", 
            markdown_content=blog_content, 
            tags=social_tags, 
            cover_url=blog_cover_url
        )
        if devto_url_resp:
            devto_url = devto_url_resp
            add_log(f"Successfully posted to DEV.to: {devto_url}")
        else:
            add_log("Failed to post to DEV.to")

    return {
        "logs": logs,
        "video_url": final_video_url,
        "blog_cover_url": blog_cover_url,
        "devto_url": devto_url,
        "assets": assets
    }

marketing_graph = StateGraph(MarketingState)
marketing_graph.add_node("script_agent", script_agent)
marketing_graph.add_node("production_agent", production_agent)
marketing_graph.set_entry_point("script_agent")
marketing_graph.add_edge("script_agent", "production_agent")
marketing_graph.add_edge("production_agent", END)
marketing_app = marketing_graph.compile()
