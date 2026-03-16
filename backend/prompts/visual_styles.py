"""
visual_styles.py — Four visual style presets for Mosaic.

Each style has:
  - gemini_style_prompt : injected into the Gemini image generation prompt
  - veo_style_suffix    : appended to every Veo video prompt
  - label               : human-readable display name
  - description         : shown in the UI dropdown
"""

VISUAL_STYLES = {
    "cinematic": {
        "id": "cinematic",
        "label": "Cinematic",
        "icon": "🎬",
        "description": "ARRI Alexa 4K. Photorealistic, dramatic lighting. Best for modern & breaking events.",
        "gemini_style_prompt": """Visual style — CINEMATIC DOCUMENTARY:
- Photorealistic 4K documentary photography, NOT illustration or painting
- ARRI Alexa / RED Dragon aesthetic — sharp, high dynamic range, accurate colors
- Dramatic cinematic lighting: deep shadows, motivated practicals, volumetric rays
- Shallow depth of field, anamorphic lens bokeh, subtle lens flares
- Color grade: teal-orange richness, deep blacks, luminous highlights
- Composition: 16:9 widescreen, rule of thirds, strong depth planes
- Natural skin texture, fine pores, visible fabric weave — physically grounded
- No text overlays, no watermarks, no cartoon/illustrated elements""",
        "veo_style_suffix": (
            "Cinematic documentary photography. ARRI Alexa aesthetic, anamorphic lens, "
            "shallow depth of field, high dynamic range. Teal-orange color grade, deep blacks, "
            "dramatic motivated lighting. Natural skin texture, visible fabric weave. "
            "Negative: illustration, cartoon, animation, watercolor, sketched, painted, text overlays."
        ),
    },

    "illustrated": {
        "id": "illustrated",
        "label": "Illustrated",
        "icon": "🎨",
        "description": "Painterly BBC documentary art. Warm canvas textures. Great for historical & science topics.",
        "gemini_style_prompt": """Visual style — PAINTED ILLUSTRATION:
- Cinematic digital painting — painterly brushstrokes, visible canvas texture
- BBC/NatGeo documentary concept art aesthetic — high-end editorial painted illustration
- Color palette: muted earth tones — ochre, sienna, slate blue — golden-hour warmth as accent
- Lighting: dramatic chiaroscuro, deep shadows, volumetric light shafts
- Composition: 16:9 widescreen, rule of thirds, rich foreground/background depth
- Atmosphere: slight haze, dust motes, impressionistic depth-of-field blur in background
- Human figures: painterly, expressive, era-accurate costume and setting
- NOT photorealistic — this must look like a masterful painted artwork
- No text overlays, no watermarks, no captions""",
        "veo_style_suffix": (
            "Painterly illustrated documentary style. Oil painting on canvas aesthetic, "
            "visible brushstrokes, warm chiaroscuro lighting, muted earth-tone palette — "
            "ochre, sienna, slate blue. BBC documentary concept art look. "
            "Negative: photorealistic, photograph, text overlays, cartoon, anime, watermark."
        ),
    },

    "anime": {
        "id": "anime",
        "label": "Anime / Ghibli",
        "icon": "✨",
        "description": "Studio Ghibli & Makoto Shinkai inspired. Emotional, stunning visuals for storytelling.",
        "gemini_style_prompt": """Visual style — ANIME / STUDIO GHIBLI:
- Studio Ghibli + Makoto Shinkai anime aesthetic
- Lush, expressive hand-drawn animation look — clean lines, vivid saturated colors
- Dramatic atmospheric lighting: golden hour, god rays, luminous skies, soft auras
- Painterly detailed backgrounds — dense foliage, cloudscapes, architectural detail
- Characters: large expressive eyes, clean linework, anime proportion — emotionally readable
- Color palette: rich saturated hues — deep blues, warm ambers, verdant greens
- Cinematic composition: 16:9 wide aspect, dynamic camera framing
- No text overlays, no watermarks, no photorealistic elements""",
        "veo_style_suffix": (
            "Studio Ghibli anime style. Hand-drawn 2D animation aesthetic, clean linework, "
            "vivid saturated colors, lush detailed backgrounds, expressive characters. "
            "Makoto Shinkai dramatic sky lighting — golden rays, atmospheric glow. "
            "Negative: photorealistic, photograph, oil painting, rotoscope, text overlays, watermark."
        ),
    },

    "rotoscope": {
        "id": "rotoscope",
        "label": "Rotoscope",
        "icon": "🎭",
        "description": "Waltz with Bashir style. Raw, powerful. Ideal for conflict, trauma, and high-stakes journalism.",
        "gemini_style_prompt": """Visual style — ROTOSCOPE / GRAPHIC NOVEL:
- Rotoscoped animation style — like 'Waltz with Bashir' or 'Waking Life'
- High-contrast graphic novel / comic-art aesthetic — bold outlines, stark shadow areas
- Limited but purposeful color palette — often near-monochrome with selective color accents
- Dramatic chiaroscuro — harsh light/dark contrast, cel-shaded shadows
- Figures traced from real motion — human but stylized, emotionally intense
- Dark, raw, visceral atmosphere — conveys gravity and urgency
- Loose expressive linework, slightly abstracted backgrounds
- No text overlays, no watermarks, no photorealistic or painted elements""",
        "veo_style_suffix": (
            "CRITICAL STYLE RULE: render as rotoscope animation, not as live-action footage. "
            "The final video must look like stylized traced animation in the spirit of 'Waltz with Bashir' or 'A Scanner Darkly', "
            "with bold inked outlines, posterized shapes, cel-shaded shadow blocks, flattened tonal transitions, "
            "limited stark color palette, graphic novel contrast, and illustrated human forms rather than natural human skin. "
            "Movement should feel like traced live-action animation, not photographic realism. "
            "Faces, hands, clothing, and backgrounds must remain stylized and drawn, never photoreal. "
            "Negative: live-action footage, photorealistic humans, realistic skin pores, camera realism, lens realism, watercolor, Studio Ghibli, text overlays, watermark."
        ),
    },
}


def get_visual_style(style_id: str) -> dict:
    """Return the visual style config for a given ID. Defaults to 'cinematic'."""
    return VISUAL_STYLES.get(style_id, VISUAL_STYLES["cinematic"])


def get_gemini_style_prompt(style_id: str) -> str:
    return get_visual_style(style_id)["gemini_style_prompt"]


def get_veo_style_suffix(style_id: str) -> str:
    return get_visual_style(style_id)["veo_style_suffix"]
