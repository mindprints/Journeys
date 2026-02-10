#!/usr/bin/env python3
"""
Shared helpers for poster grabbers.
"""

from datetime import datetime
from pathlib import Path
import json
import re
import unicodedata


EXCLUDE_DIR_NAMES = {"poster_schemas", "Journeys"}


def normalize_text(value):
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def normalize_url(value):
    if not value:
        return ""
    normalized = value.strip().lower()
    return normalized[:-1] if normalized.endswith("/") else normalized


def to_ascii(value):
    if value is None:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    return normalized.encode("ascii", "ignore").decode("ascii")


def collect_existing_poster_keys(poster):
    keys = {
        "titles": set(),
        "tags": set(),
        "sources": set(),
        "links": set(),
    }

    front = poster.get("front", {})
    meta = poster.get("meta", {})
    back = poster.get("back", {})

    title = front.get("title")
    if title:
        keys["titles"].add(normalize_text(title))

    for tag in meta.get("tags", []) or []:
        keys["tags"].add(normalize_text(tag))

    source = meta.get("source")
    if source:
        keys["sources"].add(normalize_url(source))

    for link in back.get("links", []) or []:
        url = link.get("url")
        if url:
            keys["links"].add(normalize_url(url))

    return keys


def build_existing_index(existing_roots, exclude_dir_names=None):
    exclude_dir_names = exclude_dir_names or EXCLUDE_DIR_NAMES
    index = {
        "titles": set(),
        "tags": set(),
        "sources": set(),
        "links": set(),
    }
    lookup = {
        "titles": {},
        "tags": {},
        "sources": {},
        "links": {},
    }

    for root_dir in existing_roots:
        if not root_dir.exists():
            continue

        for file_path in root_dir.rglob("*.json"):
            if any(part in exclude_dir_names for part in file_path.parts):
                continue
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    poster = json.load(f)
            except (OSError, json.JSONDecodeError):
                continue

            keys = collect_existing_poster_keys(poster)
            for key, values in keys.items():
                index[key].update(values)
                for value in values:
                    if value and value not in lookup[key]:
                        lookup[key][value] = file_path

    return index, lookup


def find_duplicate_reason(title, topic, url, existing_index):
    normalized_title = normalize_text(title or "")
    normalized_topic = normalize_text((topic or "").replace("_", " "))
    normalized_url = normalize_url(url or "")

    if normalized_url and (
        normalized_url in existing_index["sources"]
        or normalized_url in existing_index["links"]
    ):
        return "source"

    if normalized_title and (
        normalized_title in existing_index["titles"]
        or normalized_title in existing_index["tags"]
    ):
        return "title"

    if normalized_topic and normalized_topic in existing_index["tags"]:
        return "tag"

    return None


def find_existing_match_path(poster, topic, existing_lookup):
    front = poster.get("front", {})
    meta = poster.get("meta", {})
    back = poster.get("back", {})

    title = front.get("title", "")
    source = meta.get("source", "")

    normalized_title = normalize_text(title)
    normalized_topic = normalize_text((topic or "").replace("_", " "))
    normalized_source = normalize_url(source)

    if normalized_source:
        if normalized_source in existing_lookup["sources"]:
            return existing_lookup["sources"][normalized_source]
        if normalized_source in existing_lookup["links"]:
            return existing_lookup["links"][normalized_source]

    for link in back.get("links", []) or []:
        url = normalize_url(link.get("url", ""))
        if url in existing_lookup["sources"]:
            return existing_lookup["sources"][url]
        if url in existing_lookup["links"]:
            return existing_lookup["links"][url]

    if normalized_title:
        if normalized_title in existing_lookup["titles"]:
            return existing_lookup["titles"][normalized_title]
        if normalized_title in existing_lookup["tags"]:
            return existing_lookup["tags"][normalized_title]

    if normalized_topic and normalized_topic in existing_lookup["tags"]:
        return existing_lookup["tags"][normalized_topic]

    return None


def merge_enrich_poster(existing_poster, new_poster):
    changed = False

    existing_front = existing_poster.setdefault("front", {})
    existing_back = existing_poster.setdefault("back", {})
    existing_meta = existing_poster.setdefault("meta", {})

    new_front = new_poster.get("front", {})
    new_back = new_poster.get("back", {})
    new_meta = new_poster.get("meta", {})

    if not existing_front.get("subtitle") and new_front.get("subtitle"):
        existing_front["subtitle"] = new_front["subtitle"]
        changed = True

    if not existing_back.get("text") and new_back.get("text"):
        existing_back["text"] = new_back["text"]
        changed = True

    if not existing_back.get("image") and new_back.get("image"):
        existing_back["image"] = new_back["image"]
        changed = True

    existing_links = existing_back.get("links") or []
    existing_back["links"] = existing_links
    new_links = new_back.get("links") or []
    existing_link_urls = {normalize_url(link.get("url", "")) for link in existing_links}
    for link in new_links:
        url = normalize_url(link.get("url", ""))
        if url and url not in existing_link_urls:
            existing_links.append(link)
            existing_link_urls.add(url)
            changed = True

    if not existing_meta.get("source") and new_meta.get("source"):
        existing_meta["source"] = new_meta["source"]
        changed = True

    existing_tags = existing_meta.get("tags") or []
    existing_meta["tags"] = existing_tags
    existing_tag_keys = {normalize_text(tag) for tag in existing_tags}
    for tag in new_meta.get("tags") or []:
        normalized_tag = normalize_text(tag)
        if normalized_tag and normalized_tag not in existing_tag_keys:
            existing_tags.append(tag)
            existing_tag_keys.add(normalized_tag)
            changed = True

    if changed:
        existing_meta["modified"] = datetime.now().isoformat()

    return changed


def save_poster(poster, output_dir, filename):
    output_dir.mkdir(exist_ok=True)
    filepath = output_dir / filename

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(poster, f, indent=2, ensure_ascii=True)

    print(f"Created: {filename}")


def save_existing_poster(filepath, poster):
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(poster, f, indent=2, ensure_ascii=True)
