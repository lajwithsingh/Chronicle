"""
EraResearchAgent — dynamically researches era or context details for ANY time period (past or present)
(Ancient civilizations through 2025) and ANY geography/demographic.

Architecture:
  3 specialists run concurrently via asyncio.gather:
    ├── MaterialCultureResearcher  → session.state["era_material_culture_raw"]
    ├── ArchitectureResearcher     → session.state["era_architecture_raw"]
    ├── TechnologyResearcher       → session.state["era_technology_raw"]
  Then synthesizer runs sequentially:
    └── EraStyleBibleSynthesizer   → session.state["style_bible"]

Requires in session.state before running:
  - "era_context"  : str  (built by orchestrator from research_brief)
  - "detected_year": int

Outputs to session.state:
  - "style_bible"  : str  (60-80 word dense style bible for Veo prompts)
  - "era_style"    : str  (human-readable era label)
"""

import asyncio
import json
import logging
from typing import AsyncGenerator

from google.adk.agents import BaseAgent, LlmAgent
from google.adk.events import Event
from google.adk.tools import google_search
from google.genai import types

from backend.config.settings import settings
from backend.prompts.style_bible import get_style_bible, get_era_style_name

logger = logging.getLogger("chronicle.era_research_agent")

# Material Culture Researcher
_MATERIAL_CULTURE_PROMPT = """You are an era-specific costume and material culture researcher.

Documentary context:
{era_context}

Use Google Search to research the SPECIFIC clothing, hairstyles, physical appearance descriptors,
accessories, and fabrics for the exact era, country/region, and demographic described above.

CRITICAL: Research for the ACTUAL geography and people in the context — not generic Western fashion.
Examples:
- 1930s India → dhoti, sari, khadi, colonial khaki uniforms — NOT fedoras and trench coats
- 960s China → Mao jackets, qipao, Red Guard attire — NOT mod dresses and go-go boots
- 14th century Mali Empire → boubou robes, gold jewelry, kente cloth — NOT European chainmail
- 2010s Silicon Valley → hoodies, jeans, MacBooks — NOT VHS cassettes
- Ancient Rome 50 BCE → toga, tunica, military lorica segmentata

For pre-photographic eras (before 1826): research period paintings, frescos, sculptures as reference.
For modern eras (2000–2025): research contemporary documentary/news footage aesthetics.

Use search queries like:
- "{era} {country} traditional clothing documentary"
- "{era} {region} historical costume photography"
- "{era} {people} typical appearance hairstyle"

Return a JSON object with these fields:
{
  "primary_clothing": "specific garments worn by the main figures in this documentary context",
  "secondary_clothing": "clothing of background people, crowd, workers, etc.",
  "hairstyles": "period-accurate hairstyles specific to this demographic",
  "accessories": "headwear, jewelry, carried items, weapons/tools if relevant",
  "physical_descriptors": "detailed appearance descriptors for the key figures' demographic — include skin tone range, typical build, facial features — specific enough to anchor Veo character generation",
  "fabrics_materials": "specific fabric names and textures: cotton, silk, wool, synthetic, etc.",
  "wardrobe_negative_nouns": "comma-separated noun list of specific clothing items that did NOT exist in this era/region — e.g., 'sneakers, hoodies, jeans, miniskirts' (use nouns only, no 'no X' format)"
}

Return ONLY valid JSON. No markdown, no explanation."""

# Architecture & Environment Researcher
_ARCHITECTURE_PROMPT = """You are an architecture and urban environment researcher.

Documentary context:
{era_context}

Use Google Search to research the SPECIFIC buildings, streets, landscapes, and environmental
details for the exact era AND geographic region described above.

CRITICAL: Research for the ACTUAL location — a 1960s street in Havana, Beijing, Mumbai, and
New York look completely different. A medieval West African city differs from medieval Paris.

Examples:
- 1940s Tokyo → wood-and-paper machiya buildings, narrow alleys, temple gates, streetcars
- 1980s Soviet Moscow → Stalinist architecture, constructivist buildings, Lada cars, grey concrete
- 15th century Florence → Renaissance palaces, piazzas, stone streets, horse-drawn carts
- 2015 Lagos → modern high-rises alongside corrugated iron markets, okada motorcycles, colorful buses
- Ancient Athens 5th century BCE → marble columns, agora, olive groves, trireme ships in harbor

For pre-photographic eras: research archaeological records, period paintings, historical maps.

Use search queries like:
- "{era} {city/region} street photography historical"
- "{era} {country} architecture documentary footage"
- "{era} {region} urban landscape historical record"

Return a JSON object:
{
  "dominant_architecture": "primary building types, construction materials, distinctive features",
  "street_environment": "road surfaces, signage style, street furniture, urban density",
  "landscape_vegetation": "natural environment, trees, terrain specific to the region",
  "vehicles_transport": "period-accurate transportation modes for this specific region",
  "lighting_infrastructure": "what provided light — candles, gas lamps, electric streetlights, neon",
  "distinctive_visual_elements": "2-3 highly specific environmental details that instantly identify this era+region",
  "architecture_negative_nouns": "comma-separated nouns of modern elements to exclude — e.g., 'glass skyscrapers, neon LED signs, SUVs, solar panels' (nouns only)"
}

Return ONLY valid JSON. No markdown, no explanation."""

# Technology & Media Researcher
_TECHNOLOGY_PROMPT = """You are a technology and media researcher.

Documentary context:
{era_context}

Use Google Search to research the SPECIFIC technology, tools, media formats, and everyday objects
present in this exact era AND country/region. Consider the actual development level —
a 1950s rural Indian village has fundamentally different technology from 1950s New York.

Examples:
- 1969 NASA Houston → mainframe computers with punch cards, reel-to-reel tape, analog dials
- 1989 Berlin → CRT televisions, rotary phones, Trabant cars, analog radio
- 1400s Aztec Tenochtitlán → stone tools, cacao vessels, feathered standards, obsidian blades
- 2020 Wuhan → smartphones, PPE masks, WeChat, electric scooters, QR code payments
- 1960s rural Vietnam → bicycles, conical hats, rice paddy tools, transistor radio

For pre-industrial eras: focus on craft tools, agricultural implements, military equipment,
religious objects, writing implements of the period and culture.

Use search queries like:
- "{era} {country} everyday technology objects"
- "{era} {region} communication media historical"
- "what technology existed in {era} {country}"

Return a JSON object:
{
  "communication_devices": "phones, telegraph, radio, internet, messaging technology present",
  "computing_media": "computers, tablets, typewriters, abacus — whatever existed",
  "everyday_tools_objects": "tools, appliances, containers, writing implements, domestic objects",
  "media_entertainment": "newspapers, books, posters, films, music players, games",
  "transportation_tech": "engines, animals, fuel sources, infrastructure",
  "era_defining_objects": "2-3 highly specific objects that instantly signal this era+region — e.g., 'Nokia 3310, Walkman cassette player, brick mobile phone'",
  "technology_negative_nouns": "comma-separated nouns of technology that did NOT exist yet — e.g., 'smartphones, flat-screen TVs, laptops, LED lights, QR codes' (nouns only)"
}

Return ONLY valid JSON. No markdown, no explanation."""

# Era Style Bible Synthesizer
_SYNTHESIZER_PROMPT = """You are a documentary visual director compiling an Era Style Bible for Veo 3.1 video generation.

Documentary context:
{era_context}

Research inputs from 3 specialists:

MATERIAL CULTURE (clothing, appearance):
{era_material_culture_raw}

ARCHITECTURE & ENVIRONMENT:
{era_architecture_raw}

TECHNOLOGY & MEDIA:
{era_technology_raw}

Compile ALL research into a single dense Era Style Bible string of 65-80 words maximum.
This string will be appended to EVERY Veo 3.1 video generation prompt for this documentary.

STRICT FORMAT RULES (Veo 3.1 specific):
1. Start with the overall visual mood for this documentary era
2. Describe the color palette and lighting in plain visual terms
3. Add 1 compact sentence describing the primary figures' appearance and clothing
4. Add 2-3 era+region-specific props or environmental details
5. Negative — NOUNS ONLY (never "no X" or "avoid X" format): list 5-7 anachronistic items

OUTPUT FORMAT (single block of text, no JSON, no labels, no line breaks between items):
"[Overall visual mood]. [Color palette]. [Lighting]. [Physical descriptors, specific clothing]. [2-3 environment anchors]. Negative: [noun1, noun2, noun3, noun4, noun5, noun6, noun7]."

EXAMPLES BY ERA:

1940s USA wartime:
"Vintage newsreel aesthetic, deep blacks, pronounced grain. High-contrast highlights, pure black shadows. Film noir chiaroscuro, single tungsten desk lamp 2800K, venetian blind shadow lines. Middle-aged Caucasian men in wool suits with wide lapels, fedoras, women in A-line dresses with padded shoulders. Rotary telephone on oak desk, wartime propaganda poster on brick wall. Negative: film borders, camera reel, color footage, smartphones, LED lighting, plastic chairs, flat-screen monitors, synthetic fabrics, modern fonts."

1960s India independence movement:
"Warm slightly muted tones, soft contrast. Warm amber highlights, muted olive shadows. Soft diffused daylight from camera-left, slight tropical warmth 5500K. South Asian men in white hand-spun khadi dhoti and nehru jacket, women in cotton sari with border detail. Bullock cart on unpaved dusty road, hand-painted Hindi text banners, colonial administrative building facade. Negative: film borders, camera reel, synthetic clothing, automobiles, digital screens, LED signage, modern fonts, Western suits."

Ancient Rome 50 BCE:
"Old Masters epic painting aesthetic, dramatic chiaroscuro, classical composition. Deep ochre and terra cotta tones, warm candlelit shadows. Torchlight from camera-right 2200K, hard shadows, rim of cool sky light 6000K. Mediterranean men in white wool toga and tunica, leather sandals, centurion in lorica segmentata. Marble column with Latin inscription, clay amphora vessels, cobbled forum stones. Negative: modern clothing, electricity, glass windows, metal tools of modern manufacture, printed text."

2020s Silicon Valley:
"Clean 4K digital aesthetic, natural color science. Cool blue-grey highlights, neutral shadows, subtle teal grade. Large soft window light 5600K daylight, slight fill from monitor glow 6500K. Ethnically diverse young professionals in hoodies, jeans, Apple earbuds. Open-plan office with standing desks, multiple monitors, whiteboards with diagrams, La Croix cans. Negative: film grain, CRT monitors, formal business suits, rotary phones, physical newspapers."

Now compile the style bible for the documentary described in the context above.
Output ONLY the style bible string — nothing else. No JSON, no labels, no preamble."""


# ─────────────────────────────────────────────────────────────────────────────
# Helper: drain ADK agent generator into a list of events
# ─────────────────────────────────────────────────────────────────────────────
async def _run_agent_collect(agent: LlmAgent, ctx) -> list[Event]:
    """Consume an ADK agent's async generator and collect all events."""
    events = []
    async for event in agent.run_async(ctx):
        events.append(event)
    return events


# ─────────────────────────────────────────────────────────────────────────────
# EraResearchAgent — custom BaseAgent orchestrating 3 parallel specialists
# ─────────────────────────────────────────────────────────────────────────────
class EraResearchAgent(BaseAgent):
    """
    Dynamically researches era details for any time period and geography (past or present).
    Runs 3 LlmAgent specialists concurrently, then synthesizes into a Veo-ready
    Era Style Bible stored at session.state["style_bible"].
    """

    material_culture_agent: LlmAgent
    architecture_agent: LlmAgent
    technology_agent: LlmAgent
    synthesizer_agent: LlmAgent

    model_config = {"arbitrary_types_allowed": True}

    def __init__(self):
        _safety_settings = [
            types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_NONE"),
            types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_NONE"),
            types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_NONE"),
            types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_NONE"),
        ]

        _afc_config = types.GenerateContentConfig(
            automatic_function_calling=types.AutomaticFunctionCallingConfig(
                maximum_remote_calls=30,
            ),
            safety_settings=_safety_settings,
        )

        _synthesizer_config = types.GenerateContentConfig(
            temperature=0.3,
            safety_settings=_safety_settings,
        )

        _material = LlmAgent(
            model=settings.GEMINI_TEXT_MODEL,
            name="era_material_culture_researcher",
            description="Researches period clothing, appearance, and material culture for the documentary era.",
            instruction=_MATERIAL_CULTURE_PROMPT,
            tools=[google_search],
            output_key="era_material_culture_raw",
            generate_content_config=_afc_config,
        )
        _architecture = LlmAgent(
            model=settings.GEMINI_TEXT_MODEL,
            name="era_architecture_researcher",
            description="Researches period architecture, streets, and environment for the documentary era.",
            instruction=_ARCHITECTURE_PROMPT,
            tools=[google_search],
            output_key="era_architecture_raw",
            generate_content_config=_afc_config,
        )
        _technology = LlmAgent(
            model=settings.GEMINI_TEXT_MODEL,
            name="era_technology_researcher",
            description="Researches period technology, tools, and media for the documentary era.",
            instruction=_TECHNOLOGY_PROMPT,
            tools=[google_search],
            output_key="era_technology_raw",
            generate_content_config=_afc_config,
        )
        _synthesizer = LlmAgent(
            model=settings.GEMINI_TEXT_MODEL,
            name="era_style_bible_synthesizer",
            description="Synthesizes all era research into a concise Veo-ready Era Style Bible.",
            instruction=_SYNTHESIZER_PROMPT,
            output_key="style_bible",
            generate_content_config=_synthesizer_config,
        )

        super().__init__(
            name="era_research_agent",
            description=(
                "Researches historical era details (clothing, architecture, technology) "
                "for any time period and geography, then synthesizes a "
                "Veo 3.1-ready Era Style Bible."
            ),
            material_culture_agent=_material,
            architecture_agent=_architecture,
            technology_agent=_technology,
            synthesizer_agent=_synthesizer,
            sub_agents=[_material, _architecture, _technology, _synthesizer],
        )

    async def _run_async_impl(self, ctx) -> AsyncGenerator[Event, None]:
        session_id = ctx.session.id
        year = ctx.session.state.get("detected_year", 1969)
        era_context = ctx.session.state.get("era_context", f"Year: {year}")

        logger.info(f"[{session_id}] EraResearchAgent starting for: {era_context[:80]}...")

        # ── Emit SSE progress event ───────────────────────────────────────────
        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text=json.dumps({
                    "sse_type": "era_research_start",
                    "message": "Researching historical era — clothing, architecture, and technology",
                    "detected_year": year,
                }))],
            ),
        )

        # ── Phase 1: Run 4 specialists CONCURRENTLY ───────────────────────────
        specialist_results = await asyncio.gather(
            _run_agent_collect(self.material_culture_agent, ctx),
            _run_agent_collect(self.architecture_agent, ctx),
            _run_agent_collect(self.technology_agent, ctx),
            return_exceptions=True,
        )

        # Yield all specialist events (for ADK tracing) + log any failures
        specialist_names = ["material_culture", "architecture", "technology"]
        for name, result in zip(specialist_names, specialist_results):
            if isinstance(result, Exception):
                logger.warning(f"[{session_id}] Era specialist '{name}' failed: {result}")
                # Provide a minimal fallback so synthesizer still has something to work with
                fallback_key = f"era_{name}_raw"
                ctx.session.state[fallback_key] = f"Research unavailable for {name}. Use general knowledge for {year}."
            else:
                for event in result:
                    yield event

        # Log what we got
        for key in ["era_material_culture_raw", "era_architecture_raw", "era_technology_raw"]:
            val = ctx.session.state.get(key, "")
            logger.info(f"[{session_id}] {key}: {str(val)[:100]}...")

        # ── Phase 2: Synthesizer (sequential — needs all 4 outputs) ──────────
        logger.info(f"[{session_id}] EraResearchAgent running synthesizer...")
        try:
            async for event in self.synthesizer_agent.run_async(ctx):
                yield event
        except Exception as e:
            logger.error(f"[{session_id}] Style bible synthesizer failed: {e}")
            # Fall back to static style bible
            ctx.session.state["style_bible"] = _build_fallback_style_bible(year)

        # ── Validate synthesizer output ───────────────────────────────────────
        style_bible = ctx.session.state.get("style_bible", "")

        # ADK sometimes wraps output in JSON {"text": "..."} — unwrap if needed
        if isinstance(style_bible, dict):
            style_bible = style_bible.get("text", "") or style_bible.get("style_bible", "")
            ctx.session.state["style_bible"] = style_bible

        if not style_bible or len(str(style_bible).strip()) < 20:
            logger.warning(f"[{session_id}] Style bible too short or empty, using fallback")
            ctx.session.state["style_bible"] = _build_fallback_style_bible(year)
            style_bible = ctx.session.state["style_bible"]

        # Use the standard era label for the researched year.
        era_style_label = get_era_style_name(year)
        ctx.session.state["era_style"] = era_style_label

        logger.info(f"[{session_id}] Era style bible compiled: '{str(style_bible)[:120]}...'")
        logger.info(f"[{session_id}] Era style label: {era_style_label}")

        # ── Emit SSE done event ───────────────────────────────────────────────
        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text=json.dumps({
                    "sse_type": "era_research_done",
                    "era_style": era_style_label,
                    "style_bible_preview": str(style_bible)[:150],
                    "detected_year": year,
                }))],
            ),
        )


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _build_fallback_style_bible(year: int) -> str:
    """Return the static style bible as fallback if era research fails."""
    return get_style_bible(year)


def build_era_context(
    topic: str,
    year: int,
    research_brief: dict,
) -> str:
    """
    Build the era_context string from research brief data.
    Called by the orchestrator before running EraResearchAgent.
    Covers all time periods correctly including ancient, medieval, and modern.
    """
    # Decade description — works for all time periods
    if year < 0:
        decade_desc = f"{abs(year)} BCE"
    elif year < 1000:
        decade_desc = f"{year} CE"
    elif year < 1900:
        decade_desc = f"{year}s"
    else:
        decade_start = (year // 10) * 10
        decade_desc = f"{decade_start}s"

    # Extract key figures summary
    key_figures = research_brief.get("key_figures", [])
    if isinstance(key_figures, list):
        figures_str = "; ".join(
            f"{f.get('name', 'Unknown')} ({f.get('role', '')})"
            for f in key_figures[:4]
        )
    else:
        figures_str = str(key_figures)

    # Extract defining moment and sensory details
    defining_moment = research_brief.get("defining_moment", "")
    emotional_core = research_brief.get("emotional_core", "")
    sensory = research_brief.get("sensory_details", {})
    if isinstance(sensory, dict):
        sensory_str = f"Sounds: {sensory.get('sounds', '')}. Sights: {sensory.get('sights', '')}."
    elif isinstance(sensory, list):
        sensory_str = " ".join(sensory[:3])
    else:
        sensory_str = str(sensory)

    return f"""Documentary topic: {topic}
Primary era: {decade_desc} (year {year})
Key figures and their roles: {figures_str}
Defining historical moment: {defining_moment}
Emotional core: {emotional_core}
Sensory details from research: {sensory_str}

Research material culture, architecture, and technology
specifically for the GEOGRAPHY implied by the topic and figures above —
not generic Western defaults."""
