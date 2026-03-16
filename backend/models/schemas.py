from pydantic import BaseModel
from typing import Optional

class ChronicleRequest(BaseModel):
    topic: str
    session_id: Optional[str] = None
    visual_style: Optional[str] = "cinematic"  # "cinematic" | "illustrated" | "anime" | "rotoscope"
    voice_preference: Optional[str] = "male"
    autonomous: bool = False

class TimelineEntry(BaseModel):
    date: str
    event: str

class KeyFigure(BaseModel):
    name: str
    role: str

class ResearchBrief(BaseModel):
    topic: str
    key_figures: list[KeyFigure]
    timeline: list[TimelineEntry]
    defining_moment: str
    defining_moment_date: str
    detected_year: int                      # For Style Bible / LUT selection
    key_quote: Optional[str] = None
    emotional_core: str
    legacy: str
    sensory_details: list[str]              # Sounds, sights, textures of the era


class DocumentarySegment(BaseModel):
    segment_number: int                     # 1-15 (8-15 segments depending on story complexity)
    segment_title: str                      # 3-5 word evocative title
    visual_purpose: str                     # HOOK / CONTEXT / STAKES / BUILD / CATALYST / TURNING_POINT / RESOLUTION / LEGACY / REFLECTION / CODA
    narration_chunk: str                    # HARD LIMIT ≤18 words — exactly one 8-second Veo clip
    veo_prompt: str                         # 80-100 words, 7-element Veo formula
    audio_direction: str                    # 4-layer audio spec for post-production mix
    emotional_beat: str                     # The one feeling this segment leaves
    era_style_applied: str                  # Era style label from EraResearchAgent


class DocumentaryScript(BaseModel):
    title: str                              # Full documentary title
    total_duration_estimate: str            # e.g. "~80 seconds"
    segments: list[DocumentarySegment]


class MediaSegment(BaseModel):
    segment_number: int
    segment_title: str
    narration_chunk: str
    image_b64: str
    image_mime: str = "image/png"


class VideoClip(BaseModel):
    segment_number: int
    segment_title: str
    local_path: str                         # local tmp path after processing
    gcs_uri: str
    signed_url: str
    duration_seconds: int = 8
    processed: bool = False                 # True after 7-step pipeline


class FinalVideo(BaseModel):
    gcs_uri: str
    signed_url: str
    duration_seconds: int
    transcript: str
    topic: str
    segments_count: int = 10
    era_style: str                          # e.g. "16mm Archival" | "Kodachrome Americana"


class SSEEvent(BaseModel):
    event: str
    session_id: str
    data: dict


class ResearchValidationResult(BaseModel):
    status: str                             # "pass" | "fail"
    brief: Optional[ResearchBrief] = None
    issues: list[str] = []
    corrected_brief: Optional[ResearchBrief] = None


class ScriptValidationResult(BaseModel):
    status: str                             # "pass" | "fail"
    issues: list[str] = []


class ValidationResult(BaseModel):
    status: str                             # "pass" | "fail"
    issues: list[str] = []


class SegmentEdit(BaseModel):
    segment_number: int
    narration_chunk: Optional[str] = None
    veo_prompt: Optional[str] = None
    segment_title: Optional[str] = None


class GenerateStoryboardRequest(BaseModel):
    segment_edits: list[SegmentEdit] = []
    autonomous: bool = False  # If True, skip storyboard review and auto-trigger video generation
    visual_style: Optional[str] = None  # "cinematic" | "illustrated" | "anime" | "rotoscope"


class GenerateVideoRequest(BaseModel):
    segment_edits: list[SegmentEdit] = []
    selected_storyboard_segments: list[int] = []  # segment numbers whose images to use as Veo ref; empty = use all
    autonomous: bool = False  # If True, run video generation without waiting for user review
    voice_preference: Optional[str] = "male"



class GenerateNarrativeRequest(BaseModel):
    autonomous: bool = False
    # User-edited research fields sent back from the frontend
    defining_moment: Optional[str] = None
    key_figures: Optional[list[str]] = None
    brief_summary: Optional[str] = None
    detected_year: Optional[int] = None
    era_style: Optional[str] = None
    style_bible: Optional[str] = None  # user-edited visual style bible (overrides era research output)
    user_notes: str = ""   # additional context the user wants injected into the script


class SegmentUpdateRequest(BaseModel):
    narration_chunk: Optional[str] = None
    veo_prompt: Optional[str] = None
    segment_title: Optional[str] = None

class RegenerateVideoClipRequest(BaseModel):
    user_prompt: str

class RewriteSegmentRequest(BaseModel):
    user_prompt: str
