#!/usr/bin/env python3
"""Shared AI utilities for source adapters.

Provides image generation via OpenRouter so both the Wikipedia fallback
and the AI-Model adapter can call a single, consistent implementation.
"""

import base64
import os
import re
import time
from pathlib import Path

import requests


OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview"
DEFAULT_IMAGES_DIR = Path("images/originals")

# Prompt-type classifiers — mirrored from server.js buildAiImagePrompt
PERSON_SIGNALS = r"\b(born|scientist|researcher|engineer|professor|politician|artist|author|inventor|mathematician|philosopher|physician|architect|composer|director|actor|actress|CEO|founder|entrepreneur|activist|journalist|historian|economist|biologist|physicist|chemist|psychologist|sociologist)\b"
PLACE_SIGNALS  = r"\b(city|town|village|country|nation|state|province|region|district|island|mountain|river|lake|ocean|continent|municipality|capital|borough)\b"
OBJECT_SIGNALS = r"\b(device|machine|vehicle|robot|spacecraft|weapon|instrument|tool|chemical|compound|molecule|species|animal|plant|organism|protein|gene)\b"


def _pick_prompt_type(subtitle: str) -> str:
    """Return 'person', 'place', 'object', or 'concept' based on subtitle."""
    desc = (subtitle or "").lower()
    if re.search(PERSON_SIGNALS, desc, re.IGNORECASE):
        return "person"
    if re.search(PLACE_SIGNALS, desc, re.IGNORECASE):
        return "place"
    if re.search(OBJECT_SIGNALS, desc, re.IGNORECASE):
        return "object"
    return "concept"


def _image_api_key():
    return os.environ.get("OPENROUTER_API_KEY", "").strip()


def _image_model():
    return os.environ.get("OPENROUTER_IMAGE_MODEL", DEFAULT_IMAGE_MODEL).strip() or DEFAULT_IMAGE_MODEL


def generate_ai_image(title, subtitle="", images_dir=None):
    """Generate a museum-exhibit illustration via OpenRouter and save it locally.

    Parameters
    ----------
    title : str
        Subject of the poster (used in the prompt and filename).
    subtitle : str
        One-line description added to the prompt for context.
    images_dir : Path or str, optional
        Directory to save the image in. Defaults to images/originals.

    Returns
    -------
    str or None
        Relative path suitable for use as poster back.image.src
        (e.g. "images/originals/ai_alan_turing_1234567890.png"),
        or None if generation fails for any reason.
    """
    api_key = _image_api_key()
    if not api_key:
        return None

    model = _image_model()
    save_dir = Path(images_dir) if images_dir else DEFAULT_IMAGES_DIR

    context = f"{title}. {subtitle.strip('.')}" if subtitle else title
    prompt_type = _pick_prompt_type(subtitle)

    if prompt_type == "person":
        prompt = (
            f"Portrait illustration for a museum exhibit poster about: {context}. "
            "Subject shown in a professional, respectful setting relevant to their field. "
            "Clean editorial style, rich colours, suitable for an AI and technology museum. "
            "No text or labels."
        )
    elif prompt_type == "place":
        prompt = (
            f"Location scene for a museum exhibit poster about: {context}. "
            "Evocative landscape or cityscape, clean modern illustration style. "
            "No text or labels."
        )
    elif prompt_type == "object":
        prompt = (
            f"Technical illustration of the object or device for a museum exhibit poster about: {context}. "
            "Clean cutaway or isometric view, labelled components, scientific illustration style. "
            "White or dark background. No decorative text."
        )
    else:
        prompt = (
            f"Educational infographic diagram for a museum exhibit poster about: {context}. "
            "Show HOW it works: use labeled boxes, arrows indicating data or process flow, "
            "mathematical or pseudocode notation where helpful, and layered architecture if applicable. "
            "Style: clean technical diagram, dark background, high-contrast labels, "
            "colour-coded components. Looks like a textbook figure or IEEE paper diagram, not decorative art. "
            "No lorem ipsum. Labels must be meaningful (e.g. 'Input layer', 'Attention head', 'Loss function')."
        )

    try:
        resp = requests.post(
            OPENROUTER_CHAT_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "modalities": ["image", "text"],
                "image_config": {"aspect_ratio": "16:9"},
            },
            timeout=90,
        )
        if not resp.ok:
            print(f"[image] HTTP {resp.status_code}: {resp.text[:300]}")
            return None
        payload = resp.json()
    except Exception as exc:
        print(f"[image] generation failed: {exc}")
        return None

    # Gemini image models return image in choices[0].message.images[0].image_url.url
    message = (payload.get("choices") or [{}])[0].get("message", {})
    image_url = (message.get("images") or [{}])[0].get("image_url", {}).get("url", "")
    if not image_url:
        print(f"[image] no image in response: {str(payload)[:200]}")
        return None

    if image_url.startswith("data:"):
        try:
            img_bytes = base64.b64decode(image_url.split(",", 1)[1])
        except Exception:
            return None
    else:
        try:
            dl = requests.get(image_url, timeout=30)
            dl.raise_for_status()
            img_bytes = dl.content
        except Exception:
            return None

    # Derive a safe filename from the title
    slug = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")[:40]
    filename = f"ai_{slug}_{int(time.time())}.png"

    try:
        save_dir.mkdir(parents=True, exist_ok=True)
        (save_dir / filename).write_bytes(img_bytes)
    except OSError as exc:
        print(f"[image] could not save: {exc}")
        return None

    # Always return a web-root-relative path regardless of whether save_dir is
    # absolute or relative (avoids serialising an absolute filesystem path into
    # the poster JSON when a custom images_dir is passed in).
    return f"images/originals/{filename}"
