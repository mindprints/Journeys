#!/usr/bin/env python3
"""AI-Model source adapter.

Generates poster content for arbitrary topics using the OpenRouter API.
Reads OPENROUTER_API_KEY and (optionally) OPENROUTER_CONTENT_MODEL from
the environment. Falls back to openai/gpt-4o-mini when no model is set.
"""

from datetime import datetime
from pathlib import Path
import json
import os
import re
import time
import uuid

import requests

from grab_common import (
    build_existing_index,
    find_duplicate_reason,
    find_existing_match_path,
    merge_enrich_poster,
    normalize_text,
    normalize_url,
    save_existing_poster,
    save_poster,
    to_ascii,
)


SOURCE_NAME = "aimodel"
DEFAULT_OUTPUT_DIR = Path("ai_posters")
DEFAULT_EXISTING_ROOTS = [Path("JSON_Posters"), Path("backups")]
DEFAULT_DELAY = 1.0

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-4o-mini"


def _get_api_key():
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        raise EnvironmentError(
            "OPENROUTER_API_KEY is not set. "
            "Add it to your .env file to use the AI-Model source."
        )
    return key


def _get_model():
    return (
        os.environ.get("OPENROUTER_CONTENT_MODEL", "").strip()
        or os.environ.get("OPENROUTER_MODEL", "").strip()
        or DEFAULT_MODEL
    )


def _extract_json(text):
    """Extract the first JSON object found in a string."""
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    try:
        return json.loads(match.group())
    except json.JSONDecodeError:
        return None


def generate_poster_content(topic, category_label=None):
    """Call OpenRouter to generate structured poster content for a topic.

    Returns a dict with keys: title, subtitle, text, year (int|None), tags (list).
    Returns None on failure.
    """
    api_key = _get_api_key()
    model = _get_model()
    context = category_label or "General AI / Technology"

    prompt = (
        f'Write educational content for a museum exhibit poster about: "{topic}"\n'
        f"Category context: {context}\n\n"
        "Return ONLY valid JSON in this exact format (no markdown, no extra keys):\n"
        "{\n"
        '  "title": "Canonical display name (max 60 chars)",\n'
        '  "subtitle": "One-sentence description (max 120 chars)",\n'
        '  "text": "2-3 educational paragraphs suitable for a museum exhibit. Use plain text, no markdown.",\n'
        '  "year": 1950,\n'
        '  "tags": ["tag1", "tag2", "tag3"]\n'
        "}\n\n"
        'Set "year" to the most relevant key year (founding, invention, first publication) '
        "or null if not applicable. "
        "Write factual, engaging content appropriate for a general audience."
    )

    payload = {
        "model": model,
        "temperature": 0.4,
        "max_tokens": 600,
        "messages": [
            {
                "role": "system",
                "content": "You write concise, accurate educational content for museum exhibit posters.",
            },
            {"role": "user", "content": prompt},
        ],
    }

    try:
        response = requests.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        print(f"API error: {exc}")
        return None

    try:
        body = response.json()
    except ValueError:
        print("API returned non-JSON response")
        return None

    content = (body.get("choices") or [{}])[0].get("message", {}).get("content", "")
    if not content:
        print("API returned empty content")
        return None

    parsed = _extract_json(content)
    if not parsed:
        print("Could not parse JSON from API response")
        return None

    return parsed


def create_poster_from_aimodel(topic, category_type, existing_index, category_label=None):
    """Generate a poster for `topic` using the AI-Model source.

    Returns (poster_dict, duplicate_reason) matching the adapter contract.
    duplicate_reason is None when the poster is new.
    """
    data = generate_poster_content(topic, category_label=category_label)
    if not data:
        return None, None

    title = str(data.get("title") or topic).strip() or topic
    subtitle = str(data.get("subtitle") or "").strip()
    text = str(data.get("text") or "").strip()
    tags_raw = data.get("tags") or []
    tags = [str(t).strip() for t in tags_raw if str(t).strip()][:5]

    year = data.get("year")
    try:
        year = int(year) if year is not None else None
    except (TypeError, ValueError):
        year = None

    duplicate_reason = find_duplicate_reason(title, topic, "", existing_index)

    poster = {
        "version": 2,
        "type": "poster-v2",
        "uid": str(uuid.uuid4()),
        "front": {
            "title": title,
            "subtitle": subtitle,
        },
        "back": {
            "layout": "text-only",
            "text": text,
            "links": [],
        },
        "meta": {
            "created": datetime.now().isoformat(),
            "modified": datetime.now().isoformat(),
            "categories": [category_label] if category_label else ["AI"],
            "tags": [topic] + tags,
            "source": "openrouter/" + _get_model(),
        },
    }

    if year:
        poster["front"]["chronology"] = {
            "epochStart": year,
            "epochEnd": datetime.now().year,
            "epochEvents": [{"year": year, "name": title}],
        }

    return poster, duplicate_reason


def generate_posters(
    topics,
    category_label=None,
    count=None,
    merge_enrich=True,
    merge_only=False,
    output_dir=None,
    existing_index=None,
    existing_lookup=None,
    delay_between_requests=None,
    category_type="category",
    existing_roots=None,
):
    output_dir = output_dir or DEFAULT_OUTPUT_DIR
    delay_between_requests = (
        DEFAULT_DELAY if delay_between_requests is None else delay_between_requests
    )
    existing_roots = existing_roots or DEFAULT_EXISTING_ROOTS

    if existing_index is None or existing_lookup is None:
        existing_index, existing_lookup = build_existing_index(existing_roots)

    # Validate API key early so we fail fast with a clear message
    try:
        _get_api_key()
    except EnvironmentError as exc:
        print(f"Error: {exc}")
        return

    topics = [t for t in topics if t]
    if count:
        topics = topics[:count]

    total_created = 0
    total_failed = 0
    total_skipped = 0
    total_merged = 0
    merged_paths = []

    model = _get_model()
    print("Starting AI-Model poster generation...")
    print(f"Model: {model}")
    print(f"Output directory: {output_dir.absolute()}\n")

    for i, topic in enumerate(topics, 1):
        print(f"[{i}/{len(topics)}] Generating: {topic}... ", end="")

        poster, duplicate_reason = create_poster_from_aimodel(
            topic,
            category_type,
            existing_index,
            category_label=category_label,
        )

        if poster and not duplicate_reason:
            if merge_only:
                print("SKIP create (merge-only)")
                total_skipped += 1
                continue
            safe_topic = re.sub(r"[^a-zA-Z0-9_-]", "_", topic)
            safe_topic = to_ascii(safe_topic) or normalize_text(topic) or "topic"
            safe_topic = re.sub(r"_+", "_", safe_topic).strip("_")[:50]
            filename = f"ai_{safe_topic}.json"
            save_poster(poster, output_dir, filename)
            total_created += 1
            existing_index["titles"].add(
                normalize_text(poster.get("front", {}).get("title"))
            )
            source = normalize_url(poster.get("meta", {}).get("source"))
            if source:
                existing_index["sources"].add(source)
            for tag in poster.get("meta", {}).get("tags", []) or []:
                existing_index["tags"].add(normalize_text(tag))
        elif duplicate_reason:
            match_path = find_existing_match_path(poster, topic, existing_lookup)
            if merge_enrich and match_path:
                try:
                    with open(match_path, "r", encoding="utf-8") as f:
                        existing_poster = json.load(f)
                except (OSError, json.JSONDecodeError):
                    print(f"SKIP duplicate ({duplicate_reason})")
                    total_skipped += 1
                else:
                    if merge_enrich_poster(existing_poster, poster):
                        save_existing_poster(match_path, existing_poster)
                        print(f"MERGE enriched ({duplicate_reason})")
                        total_merged += 1
                        merged_paths.append(str(match_path))
                    else:
                        print(f"SKIP duplicate ({duplicate_reason})")
                        total_skipped += 1
            else:
                print(f"SKIP duplicate ({duplicate_reason})")
                total_skipped += 1
        else:
            print("Failed")
            total_failed += 1

        if i < len(topics):
            time.sleep(delay_between_requests)

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Created: {total_created} posters")
    print(f"SKIP duplicates: {total_skipped} posters")
    print(f"MERGE enriched: {total_merged} posters")
    print(f"Failed: {total_failed} posters")
    print(f"Output directory: {output_dir.absolute()}")
    print(
        f"\nTotal topics attempted: {total_created + total_failed + total_skipped + total_merged}"
    )

    if merged_paths:
        output_dir.mkdir(exist_ok=True)
        merge_log_path = output_dir / "merge_enrichment_ai.log"
        with open(merge_log_path, "a", encoding="utf-8") as log_file:
            log_file.write(f"{datetime.now().isoformat()}\n")
            for path in merged_paths:
                log_file.write(f"{path}\n")
            log_file.write("\n")
        print(f"Merge log: {merge_log_path.absolute()}")
