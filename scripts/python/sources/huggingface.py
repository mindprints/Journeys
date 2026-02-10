#!/usr/bin/env python3
"""Hugging Face source adapter."""

from datetime import datetime
from pathlib import Path
import json
import requests
import time
import re
import uuid

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


SOURCE_NAME = "huggingface"
DEFAULT_OUTPUT_DIR = Path("ai_posters")
DEFAULT_EXISTING_ROOTS = [Path("JSON_Posters"), Path("backups")]
DEFAULT_DELAY = 0.5

HF_API_BASE = "https://huggingface.co/api"
HF_MODELS_ENDPOINT = f"{HF_API_BASE}/models"


POPULAR_MODELS = [
    "bert-base-uncased",
    "gpt2",
    "facebook/bart-large",
    "t5-base",
    "openai/clip-vit-base-patch32",
    "microsoft/resnet-50",
    "sentence-transformers/all-MiniLM-L6-v2",
    "distilbert-base-uncased",
    "roberta-base",
    "google/flan-t5-base",
]

TEXT_GENERATION_MODELS = [
    "gpt2",
    "gpt2-medium",
    "gpt2-large",
    "EleutherAI/gpt-neo-2.7B",
    "EleutherAI/gpt-j-6B",
    "facebook/opt-350m",
    "meta-llama/Llama-2-7b-hf",
    "mistralai/Mistral-7B-v0.1",
    "google/flan-t5-large",
    "tiiuae/falcon-7b",
]

IMAGE_MODELS = [
    "runwayml/stable-diffusion-v1-5",
    "stabilityai/stable-diffusion-2-1",
    "CompVis/stable-diffusion-v1-4",
    "openai/clip-vit-large-patch14",
    "google/vit-base-patch16-224",
    "microsoft/resnet-50",
    "facebook/deit-base-distilled-patch16-224",
    "google/efficientnet-b0",
    "timm/vit_large_patch14_clip_224.openai",
]

NLP_MODELS = [
    "bert-base-uncased",
    "bert-large-uncased",
    "roberta-base",
    "roberta-large",
    "distilbert-base-uncased",
    "albert-base-v2",
    "xlnet-base-cased",
    "electra-base-discriminator",
    "facebook/bart-base",
    "t5-small",
]

MULTIMODAL_MODELS = [
    "openai/clip-vit-base-patch32",
    "openai/clip-vit-large-patch14",
    "microsoft/git-base",
    "Salesforce/blip-image-captioning-base",
    "nlpconnect/vit-gpt2-image-captioning",
    "laion/CLIP-ViT-H-14-laion2B-s32B-b79K",
]


def get_curated_sets():
    return {
        "popular": POPULAR_MODELS,
        "text-generation": TEXT_GENERATION_MODELS,
        "image": IMAGE_MODELS,
        "nlp": NLP_MODELS,
        "multimodal": MULTIMODAL_MODELS,
    }


def fetch_huggingface_model(model_id):
    url = f"{HF_API_BASE}/models/{model_id}"
    headers = {"User-Agent": "AI-Poster-Generator/1.0 (Educational Project)"}

    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Error fetching {model_id}: {e}")
        return None


def search_huggingface_models(query=None, task=None, limit=20):
    params = {
        "limit": limit,
        "sort": "downloads",
        "direction": -1,
    }

    if query:
        params["search"] = query
    if task:
        params["filter"] = task

    headers = {"User-Agent": "AI-Poster-Generator/1.0 (Educational Project)"}

    try:
        response = requests.get(
            HF_MODELS_ENDPOINT, params=params, headers=headers, timeout=10
        )
        response.raise_for_status()
        models = response.json()
        return [
            model.get("modelId") or model.get("id")
            for model in models
            if model.get("modelId") or model.get("id")
        ]
    except requests.RequestException as e:
        print(f"Error searching models: {e}")
        return []


def search_items(query=None, task=None, limit=20):
    return search_huggingface_models(query=query, task=task, limit=limit)


def extract_year_from_text(text):
    years = re.findall(r"\b(20\d{2})\b", text)
    return int(years[0]) if years else None


def determine_category(category_type, category_label=None):
    if category_label:
        return [category_label]

    categories_map = {
        "popular": ["Popular Models", "Hugging Face"],
        "text-generation": ["Text Generation", "LLMs"],
        "image": ["Image Models", "Computer Vision"],
        "nlp": ["NLP Models", "Language"],
        "multimodal": ["Multimodal", "Vision-Language"],
    }
    return categories_map.get(category_type, ["AI Models", "Hugging Face"])


def create_poster_from_huggingface(
    model_id, category_type, existing_index, category_label=None
):
    data = fetch_huggingface_model(model_id)

    if not data:
        return None, None

    model_name = data.get("modelId") or data.get("id", "")
    url = f"https://huggingface.co/{model_name}"
    duplicate_reason = find_duplicate_reason(model_name, model_id, url, existing_index)

    author = data.get("author", "Unknown")
    display_name = model_name.split("/")[-1] if "/" in model_name else model_name
    display_name = display_name.replace("-", " ").replace("_", " ").title()

    description = data.get("cardData", {}).get("description", "")
    if not description:
        description = f"Model by {author}"

    tags = data.get("tags", [])
    pipeline_tag = data.get("pipeline_tag", "")

    subtitle_parts = []
    if pipeline_tag:
        subtitle_parts.append(pipeline_tag.replace("-", " ").title())
    if author:
        subtitle_parts.append(f"by {author}")
    subtitle = " | ".join(subtitle_parts) if subtitle_parts else description[:100]

    downloads = data.get("downloads", 0)
    likes = data.get("likes", 0)

    text_parts = []
    if description:
        text_parts.append(description)
    text_parts.append("\n**Statistics:**")
    text_parts.append(f"- Downloads: {downloads:,}")
    text_parts.append(f"- Likes: {likes}")
    if pipeline_tag:
        text_parts.append(f"- Task: {pipeline_tag}")
    if tags:
        text_parts.append(f"- Tags: {', '.join(tags[:5])}")

    extract = "\n".join(text_parts)

    poster = {
        "version": 2,
        "type": "poster-v2",
        "uid": str(uuid.uuid4()),
        "front": {
            "title": display_name,
            "subtitle": subtitle,
        },
        "back": {
            "layout": "text-only",
            "text": extract,
            "links": [
                {
                    "type": "external",
                    "label": "View on Hugging Face",
                    "url": url,
                    "primary": True,
                }
            ],
        },
        "meta": {
            "created": datetime.now().isoformat(),
            "modified": datetime.now().isoformat(),
            "categories": determine_category(category_type, category_label),
            "tags": [model_name] + tags[:3],
            "source": url,
        },
    }

    created_at = data.get("createdAt")
    if created_at:
        try:
            year = int(created_at[:4])
            poster["front"]["chronology"] = {
                "epochStart": year,
                "epochEnd": datetime.now().year,
                "epochEvents": [
                    {
                        "year": year,
                        "name": "Model released on Hugging Face",
                    }
                ],
            }
        except (ValueError, TypeError):
            pass

    return poster, duplicate_reason


def generate_posters(
    models,
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

    models = [model for model in models if model]
    if count:
        models = models[:count]

    total_created = 0
    total_failed = 0
    total_skipped = 0
    total_merged = 0
    merged_paths = []

    print("Starting Hugging Face poster generation...")
    print(f"Output directory: {output_dir.absolute()}\n")

    for i, model_id in enumerate(models, 1):
        print(f"[{i}/{len(models)}] Fetching: {model_id}... ", end="")

        poster, duplicate_reason = create_poster_from_huggingface(
            model_id,
            category_type,
            existing_index,
            category_label=category_label,
        )

        if poster and not duplicate_reason:
            if merge_only:
                print("SKIP create (merge-only)")
                total_skipped += 1
                continue
            safe_model = model_id.replace("/", "_").replace("(", "").replace(")", "")
            safe_model = to_ascii(safe_model)
            if not safe_model:
                safe_model = normalize_text(model_id) or "model"
            filename = f"hf_{safe_model}.json"
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
            match_path = find_existing_match_path(poster, model_id, existing_lookup)
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

        if i < len(models):
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
        f"\nTotal models attempted: {total_created + total_failed + total_skipped + total_merged}"
    )

    if merged_paths:
        output_dir.mkdir(exist_ok=True)
        merge_log_path = output_dir / "merge_enrichment_hf.log"
        with open(merge_log_path, "a", encoding="utf-8") as log_file:
            log_file.write(f"{datetime.now().isoformat()}\n")
            for path in merged_paths:
                log_file.write(f"{path}\n")
            log_file.write("\n")
        print(f"Merge log: {merge_log_path.absolute()}")
