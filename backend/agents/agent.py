"""
ChronicleOrchestrator — root ADK agent following the official ADK custom-agent pattern.

Reference: https://google.github.io/adk-docs/agents/custom-agents/

Sub-agents are declared as typed Pydantic fields, passed as kwargs to
super().__init__(), and called via .run_async(ctx) (the public ADK method).
"""

import json
import logging
import re
import base64
from typing import AsyncGenerator

import google.genai as genai
from google.adk.agents import BaseAgent, LlmAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.genai import types

from backend.config.settings import settings
from backend.config.genai_client import get_client
from backend.prompts.style_bible import get_style_bible, get_era_style_name
from backend.agents.research_agent import ResearchAgent
from backend.agents.research_validator import ResearchValidator
from backend.agents.narrative_agent import NarrativeAgent
from backend.agents.narrative_validator import NarrativeValidator
from backend.agents.media_agent import InterleavedMediaAgent
from backend.agents.video_agent import VideoAgent
from backend.agents.assembly_agent import AssemblyAgent
from backend.agents.era_research_agent import EraResearchAgent, build_era_context
from backend.agents.reference_agent import (
    build_character_spec,
    generate_character_references,
    create_character_collage,
    stylize_character_collage,
)
from backend.tools import gcs_tool

logger = logging.getLogger("chronicle.orchestrator")


def _get_lut_path(year: int) -> str:
    import os
    base = os.path.join(os.path.dirname(__file__), "..", "assets", "luts")
    if year <= 1979:
        return os.path.join(base, "documentary_archival.cube")
    elif year <= 1988:
        return os.path.join(base, "broadcast_tape.cube")
    else:
        return os.path.join(base, "betacam_night.cube")


def _upload_character_image(session_id: str, image_b64: str, blob_name: str) -> str:
    gcs_tool.upload_bytes(base64.b64decode(image_b64), blob_name, content_type="image/png")
    return gcs_tool.get_media_proxy_url(blob_name)


async def _detect_year(topic: str, client: genai.Client) -> int:
    """Quick Gemini call to extract the primary year from a topic string.
    Handles all time periods: ancient (negative years), medieval, modern, and up to 2025.
    """
    try:
        response = await client.aio.models.generate_content(
            model=settings.GEMINI_TEXT_MODEL,
            contents=(
                f"What year did '{topic}' happen? "
                "Return only the year as a number. "
                "For BCE dates use a negative number (e.g., -44 for 44 BCE). "
                "For CE dates up to 2025 use the positive year (e.g., 1969, 2020). "
                "Return nothing else — just the number."
            ),
            config=types.GenerateContentConfig(temperature=0),
        )
        text = response.text.strip()
        # Match optional minus sign + 1–4 digit year
        match = re.search(r"-?\d{1,4}", text)
        return int(match.group()) if match else 1969
    except Exception:
        return 1969


def _get_validation_status(state_value) -> tuple[str, list]:
    """Extract status and issues list from a validation result stored in session state."""
    if isinstance(state_value, dict):
        return state_value.get("status", "fail"), state_value.get("issues", [])
    if hasattr(state_value, "status"):
        return state_value.status, getattr(state_value, "issues", [])
    return "fail", []


def _pipeline_status_event(author: str, stage: str, step: str, message: str,
                            attempt: int = 1, issues: list | None = None,
                            is_final: bool = False) -> Event:
    """Emit a pipeline_status SSE event — shows live sub-activity in the frontend sidebar."""
    data: dict = {
        "sse_type": "pipeline_status",
        "stage": stage,
        "step": step,
        "attempt": attempt,
        "message": message,
    }
    if issues:
        data["issues"] = issues[:6]  # cap display to 6
    if is_final:
        data["is_final"] = True
    return Event(
        author=author,
        content=types.Content(
            role="model",
            parts=[types.Part(text=json.dumps(data))],
        ),
    )


class ChronicleOrchestrator(BaseAgent):
    """
    Root orchestrator agent for the Chronicle documentary pipeline.
    Follows the official ADK custom-agent pattern:
    - Sub-agents declared as typed Pydantic fields
    - Passed as kwargs to super().__init__()
    - Invoked via .run_async(ctx)
    """

    # Sub-agents as typed Pydantic fields (required by ADK docs)
    research_agent: LlmAgent
    research_validator: LlmAgent
    era_research_agent: EraResearchAgent
    narrative_agent: LlmAgent
    narrative_validator: LlmAgent
    media_agent: InterleavedMediaAgent
    video_agent: VideoAgent
    assembly_agent: AssemblyAgent

    # Required: allows agent objects as Pydantic field values
    model_config = {"arbitrary_types_allowed": True}

    def __init__(self):
        _research_agent = ResearchAgent()
        _research_validator = ResearchValidator()
        _era_research_agent = EraResearchAgent()
        _narrative_agent = NarrativeAgent()
        _narrative_validator = NarrativeValidator()
        _media_agent = InterleavedMediaAgent(
            name="interleaved_media_agent",
            description="Gemini 2.5 Flash Image interleaved text+image storyboard agent.",
        )
        _video_agent = VideoAgent(
            name="video_agent",
            description="Veo 3.1 video generation agent with Style Bible and scene extension.",
        )
        _assembly_agent = AssemblyAgent(
            name="assembly_agent",
            description="7-step ffmpeg assembly pipeline agent.",
        )

        super().__init__(
            name="chronicle_orchestrator",
            description="Chronicle documentary pipeline orchestrator.",
            # Each sub-agent passed as kwarg → assigned to its Pydantic field
            research_agent=_research_agent,
            research_validator=_research_validator,
            era_research_agent=_era_research_agent,
            narrative_agent=_narrative_agent,
            narrative_validator=_narrative_validator,
            media_agent=_media_agent,
            video_agent=_video_agent,
            assembly_agent=_assembly_agent,
            # sub_agents tells ADK the full agent graph for routing/tracing
            sub_agents=[
                _research_agent,
                _research_validator,
                _era_research_agent,
                _narrative_agent,
                _narrative_validator,
                _media_agent,
                _video_agent,
                _assembly_agent,
            ],
        )

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        stage = ctx.session.state.get("pipeline_stage", "research")
        autonomous = ctx.session.state.get("autonomous_mode", False)

        if stage == "research":
            async for event in self._run_research(ctx):
                yield event
            # After research completes, we ONLY proceed to character discovery automatically if in autonomous mode.
            # Otherwise, we pause here for user review.
            if autonomous:
                async for event in self._run_character_discovery(ctx):
                    yield event
                async for event in self._run_narrative(ctx):
                    yield event
                async for event in self._run_storyboard(ctx):
                    yield event
                async for event in self._run_video(ctx):
                    yield event

        elif stage == "characters":
            async for event in self._run_character_discovery(ctx):
                yield event
            if autonomous:
                async for event in self._run_narrative(ctx):
                    yield event
                async for event in self._run_storyboard(ctx):
                    yield event
                async for event in self._run_video(ctx):
                    yield event

        elif stage == "narrative":
            async for event in self._run_narrative(ctx):
                yield event
            if autonomous:
                async for event in self._run_storyboard(ctx):
                    yield event
                async for event in self._run_video(ctx):
                    yield event
        elif stage == "storyboard":
            async for event in self._run_storyboard(ctx):
                yield event
            if autonomous:
                async for event in self._run_video(ctx):
                    yield event
        elif stage == "video":
            async for event in self._run_video(ctx):
                yield event

    async def _run_character_discovery(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        """Internal helper to discover and fetch character photos."""
        # Clear history to avoid search logs bloat
        if hasattr(ctx.session, "messages"):
            ctx.session.messages = []
        elif hasattr(ctx.session, "events"):
            ctx.session.events = []
        phase = "characters"
        
        # Ensure research_brief is available and parsed
        research_brief_raw = ctx.session.state.get("research_brief", {})
        if isinstance(research_brief_raw, str):
            try:
                cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", research_brief_raw.strip())
                research_brief = json.loads(cleaned)
            except Exception:
                research_brief = {}
        else:
            research_brief = research_brief_raw if isinstance(research_brief_raw, dict) else {}

        era_style = ctx.session.state.get("era_style", "")
        
        style_bible = ctx.session.state.get("style_bible", "")
        visual_style = ctx.session.state.get("visual_style", "cinematic")
        character_instructions = ctx.session.state.get("character_instructions", "")
        if character_instructions:
            style_bible += f"\n\nUSER PROMPT FOR CHARACTERS: {character_instructions}"

        character_specs = build_character_spec(
            research_brief,
            era_style,
            style_bible,
        )
        
        if character_specs:
            ctx.session.state["pipeline_status"] = "generating_characters"
            ref_images = []
            try:
                
                async for status_msg, image_b64 in generate_character_references(character_specs):
                    yield _pipeline_status_event(
                        self.name, phase, "character_generation",
                        status_msg,
                        attempt=1
                    )
                    if image_b64:
                        ref_images.append(image_b64)
                
                reference_urls = [
                    _upload_character_image(
                        ctx.session.id,
                        image_b64,
                        f"images/{ctx.session.id}/characters/reference_{idx + 1}.png",
                    )
                    for idx, image_b64 in enumerate(ref_images)
                ]
                ctx.session.state["character_reference_images"] = reference_urls
                collage = create_character_collage(ref_images)
                collage_url = None
                if collage:
                    collage = await stylize_character_collage(collage, visual_style)
                    collage_url = _upload_character_image(
                        ctx.session.id,
                        collage,
                        f"images/{ctx.session.id}/characters/collage.png",
                    )
                ctx.session.state["character_collage_b64"] = collage_url
                
                yield Event(
                    author=self.name,
                    content=types.Content(
                        role="model",
                        parts=[types.Part(text=json.dumps({
                            "sse_type": "character_references_ready",
                            "character_reference_images": reference_urls,
                            "character_collage_url": collage_url,
                            "character_collage_b64": collage_url,
                        }))],
                    ),
                )
            except Exception as e:
                logger.warning(f"Character reference generation failed: {e}")
                ctx.session.state["character_reference_images"] = []
                ctx.session.state["character_collage_b64"] = None
            finally:
                # Signal final for this phase
                yield _pipeline_status_event(
                    self.name, "characters", "character_generation",
                    "Character references ready.",
                    attempt=1,
                    is_final=True
                )
        else:
            ctx.session.state["character_reference_images"] = []
            ctx.session.state["character_collage_b64"] = None
            # Still emit final event so UI stops loading
            yield _pipeline_status_event(
                self.name, phase, "character_generation",
                "No characters found for reference.",
                attempt=1,
                is_final=True
            )
        
        # Advance to narrative phase
        ctx.session.state["pipeline_stage"] = "narrative"

    async def _run_research(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        client = get_client()
        topic = ctx.session.state.get("topic", "")

        # If user provided restart guidance, append it so the research agent focuses accordingly
        restart_notes = ctx.session.state.get("restart_notes", "")
        if restart_notes:
            topic = f"{topic}\n\n[RESEARCHER GUIDANCE: {restart_notes}]"

        # Step 1: Quick year detection
        year = await _detect_year(topic, client)
        ctx.session.state["detected_year"] = year

        # Steps 2-3: Research loop (max 2 iterations)
        for attempt in range(2):
            attempt_label = attempt + 1
            yield _pipeline_status_event(
                self.name, "research", "researching",
                f"Gathering historical sources{' (attempt 2)' if attempt else ''}...",
                attempt=attempt_label,
            )
            async for event in self.research_agent.run_async(ctx):
                yield event

            # --- New: Run Era Research before Fact Checker ---
            research_brief_raw = ctx.session.state.get("research_brief", {})
            if isinstance(research_brief_raw, str):
                try:
                    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", research_brief_raw.strip())
                    research_brief = json.loads(cleaned)
                    ctx.session.state["research_brief"] = research_brief
                except Exception:
                    research_brief = {}
            else:
                research_brief = research_brief_raw if isinstance(research_brief_raw, dict) else {}

            if isinstance(research_brief, dict):
                raw_year = research_brief.get("detected_year", year)
                try:
                    year = int(raw_year)
                except (TypeError, ValueError):
                    pass
            ctx.session.state["detected_year"] = year

            # Era Research: build context and run dynamic style bible agent
            era_context = build_era_context(topic, year, research_brief)
            ctx.session.state["era_context"] = era_context

            yield _pipeline_status_event(
                self.name, "research", "era_research",
                "Researching era — clothing, architecture, and technology...",
                attempt=attempt_label,
            )
            async for event in self.era_research_agent.run_async(ctx):
                yield event

            # Guarantee style_bible is set (defensive fallback)
            if not ctx.session.state.get("style_bible"):
                ctx.session.state["style_bible"] = get_style_bible(year)
            if not ctx.session.state.get("era_style"):
                ctx.session.state["era_style"] = get_era_style_name(year)

            ctx.session.state["lut_path"] = _get_lut_path(year)
            # --- End Era Research ---

            yield _pipeline_status_event(
                self.name, "research", "validating",
                "Fact-checking dates, figures, and sensory details...",
                attempt=attempt_label,
            )
            async for event in self.research_validator.run_async(ctx):
                yield event

            validation = ctx.session.state.get("research_validation", {})
            status, issues = _get_validation_status(validation)
            if status == "pass":
                yield _pipeline_status_event(
                    self.name, "research", "pass",
                    "Research validated ✓",
                    attempt=attempt_label,
                )
                break
            n = len(issues)
            yield _pipeline_status_event(
                self.name, "research", "fail",
                f"{n} issue{'s' if n != 1 else ''} found — retrying with corrections...",
                attempt=attempt_label,
                issues=issues,
            )
            if isinstance(validation, dict) and validation.get("corrected_brief"):
                ctx.session.state["research_brief"] = validation["corrected_brief"]

        research_brief = ctx.session.state.get("research_brief", {})
        era_style = ctx.session.state.get("era_style", get_era_style_name(year))

        # Emit research_done SSE event
        key_figures, brief_summary, defining_moment, timeline_count = [], "", "", 0
        if isinstance(research_brief, dict):
            brief_summary = research_brief.get("emotional_core", "")
            defining_moment = research_brief.get("defining_moment", "")
            timeline_count = len(research_brief.get("timeline", []))
            key_figures = [f.get("name", "") for f in research_brief.get("key_figures", [])]

        def _parse_era_specialist(raw) -> dict:
            """Parse a specialist output — may be JSON string, dict, or fallback string."""
            if isinstance(raw, dict):
                return raw
            if isinstance(raw, str):
                try:
                    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
                    return json.loads(cleaned)
                except Exception:
                    return {"note": raw[:300]}
            return {}

        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text=json.dumps({
                    "sse_type": "research_done",
                    "topic": topic,
                    "key_figures": key_figures,
                    "defining_moment": defining_moment,
                    "timeline_count": timeline_count,
                    "brief_summary": brief_summary,
                    "detected_year": year,
                    "era_style": era_style,
                    # Era Intelligence — all 4 specialist outputs + compiled style bible
                    "style_bible": ctx.session.state.get("style_bible", ""),
                    "era_material_culture": _parse_era_specialist(
                        ctx.session.state.get("era_material_culture_raw", {})
                    ),
                    "era_architecture": _parse_era_specialist(
                        ctx.session.state.get("era_architecture_raw", {})
                    ),
                    "era_technology": _parse_era_specialist(
                        ctx.session.state.get("era_technology_raw", {})
                    ),
                }))],
            ),
        )

        # Step 4: Advance to character phase
        ctx.session.state["pipeline_stage"] = "characters"


    async def _run_narrative(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        """Stage 1b: Write and validate the documentary script (user-triggered after research review)."""
        # Clear history to avoid Base64 image bloat from characters phase
        if hasattr(ctx.session, "messages"):
            ctx.session.messages = []
        elif hasattr(ctx.session, "events"):
            ctx.session.events = []
        topic = ctx.session.state.get("topic", "")
        era_style = ctx.session.state.get("era_style", "")
        research_brief = ctx.session.state.get("research_brief", {})

        # Inject user notes (if any) as additional context for the narrative agent
        user_notes = ctx.session.state.get("user_research_notes", "")
        if user_notes:
            ctx.session.state["script_issues"] = (
                f"\n\n📝 ADDITIONAL CONTEXT FROM RESEARCHER:\n{user_notes}\n"
                "Incorporate this information where relevant in the documentary script.\n"
            )
        else:
            ctx.session.state["script_issues"] = ""

        # Documentary script loop (max 2 iterations)
        for attempt in range(2):
            attempt_label = attempt + 1
            yield _pipeline_status_event(
                self.name, "script", "writing",
                f"Writing 8-11 segment documentary script{' (attempt 2)' if attempt else ''}...",
                attempt=attempt_label,
            )
            async for event in self.narrative_agent.run_async(ctx):
                yield event

            yield _pipeline_status_event(
                self.name, "script", "validating",
                "Checking narration quality and Veo prompt structure...",
                attempt=attempt_label,
            )
            try:
                async for event in self.narrative_validator.run_async(ctx):
                    yield event
            except Exception as e:
                logger.error(f"Script validation agent crashed: {e}")
                ctx.session.state["script_validation"] = {
                    "status": "fail",
                    "issues": [f"System error during validation: {str(e)[:100]}"]
                }

            validation = ctx.session.state.get("script_validation", {})
            status, issues = _get_validation_status(validation)
            if status == "pass":
                yield _pipeline_status_event(
                    self.name, "script", "pass",
                    "Script validated ✓",
                    attempt=attempt_label,
                )
                break
            n = len(issues)
            yield _pipeline_status_event(
                self.name, "script", "fail",
                f"{n} Veo/narration issue{'s' if n != 1 else ''} found — rewriting script...",
                attempt=attempt_label,
                issues=issues,
            )
            if issues:
                issues_text = "\n".join(f"  - {issue}" for issue in issues)
                ctx.session.state["script_issues"] = (
                    "\n⚠️  CORRECTION PASS — A previous draft was rejected. "
                    "You MUST fix ALL of the following issues in this new draft:\n"
                    f"{issues_text}\n"
                    "Do NOT repeat any of the problems listed above."
                )
                logger.info(f"Script validation failed with {n} issue(s); injecting for correction pass")

        # Emit narrative_ready SSE event with full segment data for user review
        doc_script_raw = ctx.session.state.get("documentary_script", {})
        if isinstance(doc_script_raw, dict):
            segments_list = doc_script_raw.get("segments", [])
            doc_title = doc_script_raw.get("title", topic)
            duration_est = doc_script_raw.get("total_duration_estimate", "~80 seconds")
        else:
            segments_list, doc_title, duration_est = [], topic, "~80 seconds"

        # Also emit script_done for backward compatibility
        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text=json.dumps({
                    "sse_type": "script_done",
                    "documentary_title": doc_title,
                    "total_duration_estimate": duration_est,
                    "segments": [
                        {
                            "segment_number": s.get("segment_number", i + 1),
                            "segment_title": s.get("segment_title", ""),
                            "visual_purpose": s.get("visual_purpose", ""),
                            "emotional_beat": s.get("emotional_beat", ""),
                        }
                        for i, s in enumerate(segments_list)
                    ],
                    "era_style": era_style,
                }))],
            ),
        )

        # Emit narrative_ready with full segment detail for user editing
        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text=json.dumps({
                    "sse_type": "narrative_ready",
                    "documentary_title": doc_title,
                    "segments": [
                        {
                            "segment_number": s.get("segment_number", i + 1),
                            "segment_title": s.get("segment_title", ""),
                            "narration_chunk": s.get("narration_chunk", ""),
                            "veo_prompt": s.get("veo_prompt", ""),
                            "visual_purpose": s.get("visual_purpose", ""),
                            "emotional_beat": s.get("emotional_beat", ""),
                        }
                        for i, s in enumerate(segments_list)
                    ],
                }))],
            ),
        )

        # Signal completion to UI to clear loading states
        yield _pipeline_status_event(
            self.name, "script", "pass",
            "Script ready for review.",
            attempt=1
        )

        # Advance pipeline to storyboard stage
        ctx.session.state["pipeline_stage"] = "storyboard"

    async def _run_storyboard(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        """Stage 2: Generate storyboard images for each segment."""
        # Clear history for fresh storyboard generation
        if hasattr(ctx.session, "messages"):
            ctx.session.messages = []
        elif hasattr(ctx.session, "events"):
            ctx.session.events = []
        async for event in self.media_agent.run_async(ctx):
            yield event

        failed_segments = ctx.session.state.get("storyboard_failed_segments", [])
        if failed_segments:
            ctx.session.state["pipeline_stage"] = "storyboard"
            ctx.session.state["autonomous_mode"] = False
            yield _pipeline_status_event(
                self.name,
                "system",
                "storyboard_partial",
                f"Storyboard completed with {len(failed_segments)} missing image(s). Review and retry failed segments before video generation.",
                attempt=1,
                issues=[f"segment_{seg_num}" for seg_num in failed_segments[:6]],
                is_final=True,
            )
        else:
            ctx.session.state["pipeline_stage"] = "video"

        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text=json.dumps({
                    "sse_type": "storyboard_ready",
                }))],
            ),
        )

    async def _run_video(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        """Stage 3: Generate video clips and assemble the final documentary."""
        # Clear history for massive Veo generation processing
        if hasattr(ctx.session, "messages"):
            ctx.session.messages = []
        elif hasattr(ctx.session, "events"):
            ctx.session.events = []
        async for event in self.video_agent.run_async(ctx):
            yield event

        async for event in self.assembly_agent.run_async(ctx):
            yield event

