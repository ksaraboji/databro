from typing import List, Optional
from pydantic import BaseModel

class LessonStartRequest(BaseModel):
    topic: str
    user_id: str

class InterruptionRequest(BaseModel):
    user_id: str
    question_text: Optional[str] = None
    # In a real scenario, this might accept audio bytes or a URL to audio blob
    
class LessonResponse(BaseModel):
    content_text: str
    audio_url: Optional[str] = None
    is_finished: bool
    current_section: Optional[str] = None
    plan: Optional[List[str]] = None

class MarketingRequest(BaseModel):
    topic: str
    admin_id: str
    publish_config: Optional[dict] = None

class MarketingResponse(BaseModel):
    job_id: str
    status: str
    headline: Optional[str] = None
    summary: Optional[str] = None
    article_content: Optional[str] = None
    logs: Optional[List[str]] = None
