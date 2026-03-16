import asyncio
import base64
import io
import logging
import httpx
import re
import hashlib
from typing import AsyncGenerator
from google.genai import types
from backend.config.genai_client import get_client, get_image_client
from backend.config.settings import settings
from backend.prompts.visual_styles import get_gemini_style_prompt

logger = logging.getLogger("chronicle.reference_agent")

async def get_google_knowledge_graph_image(name: str) -> str | None:
    """Tier 1 Strategy: Query the official Google Knowledge Graph API."""
    api_key = settings.KNOWLEDGE_GRAPH_API_KEY
    if not api_key:
        logger.warning("KNOWLEDGE_GRAPH_API_KEY missing in settings.")
        return None
        
    url = "https://kgsearch.googleapis.com/v1/entities:search"
    params = {
        "query": name, "key": api_key, "limit": 1, "indent": "true", "types": "Person"
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                logger.warning(f"Knowledge Graph API Error {resp.status_code}: {resp.text[:200]}")
                return None
            data = resp.json()
            for item in data.get("itemListElement", []):
                result = item.get("result", {})
                image = result.get("image", {})
                image_url = image.get("contentUrl")
                if image_url: return image_url
    except Exception as e:
        logger.warning(f"Knowledge Graph API failed: {e}")
    return None

async def _get_wikipedia_pageimage_fallback(name: str) -> str | None:
    """Standard Wikipedia PageImages API."""
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            search_resp = await client.get("https://en.wikipedia.org/w/api.php", params={
                "action": "query", "list": "search", "srsearch": name, "format": "json", "srlimit": 1
            })
            search_data = search_resp.json()
            if not search_data.get("query", {}).get("search"): return None
            title = search_data["query"]["search"][0]["title"]
            img_resp = await client.get("https://en.wikipedia.org/w/api.php", params={
                "action": "query", "titles": title, "prop": "pageimages", "piprop": "original", "format": "json"
            })
            pages = img_resp.json().get("query", {}).get("pages", {})
            for pid in pages:
                source = pages[pid].get("original", {}).get("source")
                if source: return source
    except Exception: pass
    return None

async def get_wikipedia_image(name: str) -> str | None:
    """Tier 2 Strategy: Use Wikidata for canonical P18 (image)."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MosaicHistory/1.0 (contact: info@example.com)",
        "Accept": "application/json"
    }
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=headers) as client:
            resp = await client.get("https://www.wikidata.org/w/api.php", params={
                "action": "wbsearchentities", "search": name, "language": "en", "format": "json", "limit": 1
            })
            data = resp.json()
            if not data.get("search"): return await _get_wikipedia_pageimage_fallback(name)
            entity_id = data["search"][0]["id"]
            resp = await client.get(f"https://www.wikidata.org/wiki/Special:EntityData/{entity_id}.json")
            data = resp.json()
            claims = data.get("entities", {}).get(entity_id, {}).get("claims", {})
            image_claims = claims.get("P18", [])
            if image_claims:
                filename = image_claims[0]["mainsnak"]["datavalue"]["value"].replace(" ", "_")
                md5 = hashlib.md5(filename.encode('utf-8')).hexdigest()
                return f"https://upload.wikimedia.org/wikipedia/commons/{md5[0]}/{md5[0:2]}/{filename}"
    except Exception as e:
        logger.warning(f"Wikidata failed for {name}: {e}")
    return await _get_wikipedia_pageimage_fallback(name)

async def _download_image(url: str, name: str) -> str | None:
    """Helper to download image using urllib to bypass httpx bot-detection."""
    try:
        # Run urllib in a threadpool to not block the asyncio event loop
        def _fetch():
            import urllib.request
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            })
            with urllib.request.urlopen(req, timeout=20.0) as resp:
                content_type = resp.headers.get("content-type", "").lower()
                if "html" in content_type:
                    return None, "html"
                return resp.read(), None

        raw_bytes, err = await asyncio.to_thread(_fetch)
        
        if err == "html":
            logger.warning(f"Aborting: {url} is HTML.")
            return None
            
        from PIL import Image
        Image.open(io.BytesIO(raw_bytes))
        return base64.b64encode(raw_bytes).decode("utf-8")
        
    except Exception as e: 
        logger.warning(f"Download exception for {url}: {e}")
    return None
async def _fetch_historical_photo(client, name: str) -> str | None:
    """Tiered Strategy with Google KG isolation and robust fallbacks."""
    attempted_urls = []
    
    # Tier 1: Google Knowledge Graph (Official)
    logger.info(f"Tier 1: Querying Google Knowledge Graph for {name}")
    kg_url = await get_google_knowledge_graph_image(name)
    if kg_url:
        img_b64 = await _download_image(kg_url, name)
        if img_b64: return img_b64
        attempted_urls.append(kg_url)
    
    # Tier 2: Wikipedia/Wikidata (Archival)
    logger.info(f"Tier 2: Searching Wikipedia/Wikidata Archives for {name}")
    wiki_url = await get_wikipedia_image(name)
    if wiki_url and wiki_url not in attempted_urls:
        img_b64 = await _download_image(wiki_url, name)
        if img_b64: return img_b64
        attempted_urls.append(wiki_url)
    
    # Tier 3: Pro-Search Fallback (Gemini)
    logger.info(f"Tier 3: Performing Pro-Search Fallback for {name}")
    for attempt in range(1, 4):
        try:
            history_context = f" I already tried: {', '.join(attempted_urls)}" if attempted_urls else ""
            prompt = (
                f"You are a professional archival researcher. Find a DIRECT image URL to a verified portrait or photo of {name}. "
                "CRITICAL: The URL must end in .jpg or .png and lead to a raw file, not a webpage or a stock photo site. "
                "Prefer 'upload.wikimedia.org' or 'loc.gov' directly. "
                f"{history_context}"
            )
            response = await client.aio.models.generate_content(
                model='gemini-2.0-flash', contents=prompt, config=types.GenerateContentConfig(tools=[{'google_search': {}}]))
            text = response.text.strip()
            url_match = re.search(r'https?://[^\s<>"]+?\.(?:jpg|jpeg|png|webp)', text, re.IGNORECASE)
            if url_match:
                url = url_match.group(0)
                if url not in attempted_urls:
                    img_b64 = await _download_image(url, name)
                    if img_b64: return img_b64
                    attempted_urls.append(url)
        except Exception as e:
            logger.warning(f"Tier 3 Failure: {e}")
    return None

def build_character_spec(research_brief: dict, era_style: str, style_bible: str) -> list[str]:
    if not isinstance(research_brief, dict): return []
    key_figures = research_brief.get("key_figures", [])
    specs = []
    for figure in (key_figures or [])[:3]:
        name = figure.get("name", "") if isinstance(figure, dict) else figure
        if name and name.strip(): specs.append(name.strip())
    if not specs:
        topic = research_brief.get("topic", "")
        if topic: specs.append(topic)
    return specs

def create_character_collage(images_b64: list[str]) -> str | None:
    if not images_b64: return None
    try:
        from PIL import Image
        TARGET_HEIGHT = 512
        pil_images = []
        for b64 in images_b64:
            try:
                raw = base64.b64decode(b64)
                img = Image.open(io.BytesIO(raw)).convert("RGB")
                w, h = img.size
                new_w = max(1, int(w * TARGET_HEIGHT / h))
                img = img.resize((new_w, TARGET_HEIGHT), Image.LANCZOS)
                pil_images.append(img)
            except Exception: pass
        if not pil_images: return None
        total_width = sum(img.width for img in pil_images)
        collage = Image.new("RGB", (total_width, TARGET_HEIGHT), (20, 20, 20))
        x_offset = 0
        for img in pil_images:
            collage.paste(img, (x_offset, 0))
            x_offset += img.width
        buf = io.BytesIO()
        collage.save(buf, format="PNG", optimize=True)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception: return None


async def stylize_character_collage(collage_b64: str, visual_style: str) -> str | None:
    if not collage_b64 or visual_style == "cinematic":
        return collage_b64

    try:
        client = get_image_client()
        style_prompt = get_gemini_style_prompt(visual_style)
        response = await client.aio.models.generate_content(
            model=settings.GEMINI_IMAGE_MODEL,
            contents=[
                types.Part.from_bytes(
                    data=base64.b64decode(collage_b64),
                    mime_type="image/png",
                ),
                types.Part.from_text(
                    text=(
                        "Create a stylized documentary character reference sheet from this collage.\n"
                        f"{style_prompt}\n"
                        "Preserve the same identities, facial structure, costume silhouettes, and age cues, "
                        "but convert the entire sheet into the selected visual style. "
                        "The output must be a clean multi-character reference image for later storyboard and video generation. "
                        "Do not leave any photoreal skin or live-action rendering. "
                        "No text, no labels, no captions, no extra characters."
                    )
                ),
            ],
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio="16:9"),
            ),
        )
        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            return collage_b64
        parts = getattr(getattr(candidates[0], "content", None), "parts", None) or []
        for part in parts:
            inline_data = getattr(part, "inline_data", None)
            if inline_data and getattr(inline_data, "data", None):
                return base64.b64encode(inline_data.data).decode()
    except Exception as e:
        logger.warning("Character collage stylization failed for style %s: %s", visual_style, e)
    return collage_b64

async def generate_character_references(character_specs: list[str]) -> AsyncGenerator[tuple[str, str | None], None]:
    if not character_specs: return
    client = get_client()
    for name in character_specs:
        yield (f"Searching archives: {name}...", None)
        result = await _fetch_historical_photo(client, name)
        if result: yield (f"Verified portrait found: {name}", result)
        else: yield (f"Could not find verified photo for {name}", None)
        await asyncio.sleep(1)
