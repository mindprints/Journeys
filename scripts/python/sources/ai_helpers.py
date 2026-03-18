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


OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images/generations"
DEFAULT_IMAGE_MODEL = "openai/gpt-5-image-mini"
DEFAULT_IMAGES_DIR = Path("images/originals")


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
    prompt = (
        f"Educational museum exhibit illustration for a poster about: {context}. "
        "Clean, modern graphic design style. Bold composition, rich colours. "
        "No text, labels, or words in the image. "
        "Suitable for a science and technology museum display."
    )

    try:
        resp = requests.post(
            OPENROUTER_IMAGES_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "prompt": prompt,
                "n": 1,
                "size": "1536x1024",
                "response_format": "b64_json",
            },
            timeout=90,
        )
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:
        print(f"[image] generation failed: {exc}")
        return None

    item = (payload.get("data") or [{}])[0]
    b64 = item.get("b64_json")
    url = item.get("url")

    if b64:
        try:
            img_bytes = base64.b64decode(b64)
        except Exception:
            return None
    elif url:
        try:
            dl = requests.get(url, timeout=30)
            dl.raise_for_status()
            img_bytes = dl.content
        except Exception:
            return None
    else:
        print("[image] no image data in response")
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

    # Return as a forward-slash relative path (web-root-relative)
    return f"{save_dir}/{filename}".replace("\\", "/")
