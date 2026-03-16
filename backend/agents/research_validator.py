from google.adk.agents import LlmAgent
from google.genai import types
from backend.models.schemas import ValidationResult
from backend.config.settings import settings

system_prompt = """You are a fact-checking editor at a documentary studio.
Review the research brief provided.

Check for:
1. Are all dates specific and plausible?
2. Are all named people real figures associated with this event?
3. Is the defining moment clearly identified?
4. Is there enough substance for 5 dramatic acts?
5. Are there any obvious hallucinations or fabrications?
6. Are there era-specific sensory/visual details for Veo prompts?
7. Is the detected_year valid?

Output JSON indicating pass/fail status."""

class ResearchValidator(LlmAgent):
    def __init__(self):
        super().__init__(
            model=settings.GEMINI_TEXT_MODEL,
            name="research_validator",
            description="Fact-checking editor reviewing research briefs for accuracy and sensory detail.",
            instruction=system_prompt,
            output_schema=ValidationResult,
            output_key="research_validation",
            generate_content_config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=4096,
            ),
        )
