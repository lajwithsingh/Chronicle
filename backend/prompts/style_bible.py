# Era grounding packs used when dynamic era research is unavailable.

STYLE_BIBLE_ARCHIVAL_16MM = (
    "Archival mid-century documentary atmosphere. "
    "Warm amber highlights, cool shadow separation, gently aged texture, practical interior light. "
    "Wool uniforms, analog control panels, printed paper signage, heavy industrial surfaces. "
    "Negative: text overlays, watermarks, modern clothing, smartphones, LED lighting, "
    "plastic skin, extra limbs, distorted hands, glossy modern surfaces."
)

STYLE_BIBLE_BROADCAST_TAPE = (
    "Late broadcast-era documentary atmosphere. "
    "Rich saturation, warm golden highlights, moderate contrast, slight halation from practical lights. "
    "Printed news graphics, analog monitors, tube-lit interiors, textured civic spaces. "
    "Negative: text overlays, watermarks, flat-screen displays, smartphones, LED strips, "
    "modern minimalist design, extra limbs, distorted hands, plastic skin."
)

STYLE_BIBLE_ENG_BETACAM = (
    "Field-reportage documentary atmosphere. "
    "Pushed contrast, rich shadows, sodium and tungsten warmth, urgent street-level realism. "
    "Streetlights, weathered concrete, paper posters, utilitarian vehicles, lived-in public spaces. "
    "Negative: text overlays, watermarks, flat-screen displays, smartphones, HD screens, "
    "touchscreens, extra limbs, distorted hands, plastic skin, soap opera effect."
)

STYLE_BIBLE_MODERN_4K = (
    "Contemporary documentary atmosphere. "
    "High clarity, crisp contrast, accurate colors, clean daylight interiors, polished public spaces. "
    "Glass, brushed metal, modern textiles, printed packaging, contemporary transport and signage. "
    "Negative: text overlays, watermarks, cartoon style, distorted hands, plastic skin, "
    "VHS effects, film grain, vintage filters, sepia, black and white."
)

ERA_MAP = {
    "1940s": STYLE_BIBLE_ARCHIVAL_16MM,
    "1950s": STYLE_BIBLE_ARCHIVAL_16MM,
    "1960s": STYLE_BIBLE_ARCHIVAL_16MM,
    "1970s": STYLE_BIBLE_ARCHIVAL_16MM,
    "1980s": STYLE_BIBLE_BROADCAST_TAPE,
    "1989":  STYLE_BIBLE_ENG_BETACAM,
    "1990s": STYLE_BIBLE_ENG_BETACAM,
}

def get_style_bible(year: int) -> str:
    """Static fallback era grounding — used only when EraResearchAgent fails."""
    if year <= 1979:
        return STYLE_BIBLE_ARCHIVAL_16MM
    elif year <= 1988:
        return STYLE_BIBLE_BROADCAST_TAPE
    elif year <= 2005:
        return STYLE_BIBLE_ENG_BETACAM
    else:
        return STYLE_BIBLE_MODERN_4K

def get_era_style_name(year: int) -> str:
    """Static fallback era label — used only when EraResearchAgent fails."""
    if year < 0:
        return "Ancient Era"
    elif year < 1000:
        return "Early Medieval"
    elif year < 1500:
        return "Medieval"
    elif year < 1800:
        return "Early Modern"
    elif year < 1895:
        return "19th Century"
    elif year < 1930:
        return "Silent Film Era"
    elif year <= 1979:
        return "16mm Archival"
    elif year <= 1988:
        return "BBC Broadcast"
    elif year <= 1999:
        return "ENG Betacam"
    elif year <= 2009:
        return "Early Digital"
    elif year <= 2019:
        return "HD Documentary"
    else:
        return "Modern 4K"
