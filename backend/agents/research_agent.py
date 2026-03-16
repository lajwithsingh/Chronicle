from google.adk.agents import LlmAgent
from google.adk.tools import google_search
from google.genai import types
from backend.models.schemas import ResearchBrief
from backend.config.settings import settings

system_prompt = """You are an investigative documentary and journalism researcher.
Find verified, factual information about real true events (historical or contemporary/breaking news).

For the given topic, use Google Search to find:
1. Exact dates, locations, key figures (real names only)
2. A precise timeline of events (5-7 key moments)
3. The single defining moment — the one that changed everything
4. Direct quotes from key figures if available
5. The emotional core — what made this moment matter to humanity
6. The legacy — how the world changed because of this event
7. Sensory details — sounds, sights, smells of the era
8. The exact year for styling purposes

NEVER invent dates, names, or statistics.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "topic": "string",
  "detected_year": 1969,
  "key_figures": [{"name": "string", "role": "string"}],
  "timeline": [{"year": 1969, "event": "string"}],
  "defining_moment": "string",
  "emotional_core": "string",
  "legacy": "string",
  "sensory_details": {"sounds": "string", "sights": "string", "atmosphere": "string"},
  "verified_quotes": [{"quote": "string", "speaker": "string"}]
}"""

class ResearchAgent(LlmAgent):
    def __init__(self):
        super().__init__(
            model=settings.GEMINI_TEXT_MODEL,
            name="research_agent",
            description="Investigative documentary researcher fetching verified historical facts.",
            instruction=system_prompt,
            tools=[google_search],
            output_key="research_brief",
            # output_schema intentionally omitted: Vertex AI does not support
            # controlled generation (JSON mode) together with Search tools.
            generate_content_config=types.GenerateContentConfig(
                automatic_function_calling=types.AutomaticFunctionCallingConfig(
                    maximum_remote_calls=30,
                ),
                safety_settings=[
                    types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_NONE"),
                    types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_NONE"),
                    types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_NONE"),
                    types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_NONE"),
                ],
            ),
        )
