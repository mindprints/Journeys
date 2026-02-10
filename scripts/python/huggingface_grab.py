#!/usr/bin/env python3
"""
Hugging Face to AI Poster Generator
Fetches AI models from Hugging Face and generates poster JSON files.
"""

import argparse
import requests
import json
import uuid
from datetime import datetime
from pathlib import Path
import time
import re
import unicodedata

# Configuration
OUTPUT_DIR = Path("ai_posters")
EXISTING_POSTER_ROOTS = [Path("JSON_Posters"), Path("backups")]
EXCLUDE_DIR_NAMES = {"poster_schemas", "Journeys"}
MERGE_ENRICH = True
MERGE_LOG_PATH = OUTPUT_DIR / "merge_enrichment_hf.log"
DELAY_BETWEEN_REQUESTS = 0.5  # Hugging Face is more permissive

# Hugging Face API
HF_API_BASE = "https://huggingface.co/api"
HF_MODELS_ENDPOINT = f"{HF_API_BASE}/models"


def parse_args():
    parser = argparse.ArgumentParser(description="Hugging Face to AI Poster Generator")
    parser.add_argument("--category", help="Custom category label")
    parser.add_argument("--topics", help="Comma-separated model IDs (e.g., 'bert-base-uncased,gpt2')")
    parser.add_argument("--count", type=int, help="Limit number of models to process")
    parser.add_argument("--merge-enrich", choices=["true", "false"], help="Enable merge enrichment")
    parser.add_argument("--merge-only", choices=["true", "false"], help="Skip creating new posters")
    parser.add_argument("--search", help="Search query to find models")
    parser.add_argument("--filter", help="Filter by task (e.g., 'text-generation,image-classification')")
    return parser.parse_args()


# Curated model lists by category
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
    "google/flan-t5-base"
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
    "tiiuae/falcon-7b"
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
    "timm/vit_large_patch14_clip_224.openai"
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
    "t5-small"
]

MULTIMODAL_MODELS = [
    "openai/clip-vit-base-patch32",
    "openai/clip-vit-large-patch14",
    "microsoft/git-base",
    "Salesforce/blip-image-captioning-base",
    "nlpconnect/vit-gpt2-image-captioning",
    "laion/CLIP-ViT-H-14-laion2B-s32B-b79K"
]


def fetch_huggingface_model(model_id):
    """Fetch model data from Hugging Face API"""
    url = f"{HF_API_BASE}/models/{model_id}"
    headers = {
        'User-Agent': 'AI-Poster-Generator/1.0 (Educational Project)'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Error fetching {model_id}: {e}")
        return None


def search_huggingface_models(query=None, task=None, limit=20):
    """Search for models on Hugging Face"""
    params = {
        'limit': limit,
        'sort': 'downloads',
        'direction': -1
    }
    
    if query:
        params['search'] = query
    if task:
        params['filter'] = task
    
    headers = {
        'User-Agent': 'AI-Poster-Generator/1.0 (Educational Project)'
    }
    
    try:
        response = requests.get(HF_MODELS_ENDPOINT, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        models = response.json()
        return [model.get('modelId') or model.get('id') for model in models if model.get('modelId') or model.get('id')]
    except requests.RequestException as e:
        print(f"Error searching models: {e}")
        return []


def extract_year_from_text(text):
    """Extract a year from text"""
    years = re.findall(r'\b(20\d{2})\b', text)
    return int(years[0]) if years else None


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


def build_existing_index():
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

    for root_dir in EXISTING_POSTER_ROOTS:
        if not root_dir.exists():
            continue

        for file_path in root_dir.rglob("*.json"):
            if any(part in EXCLUDE_DIR_NAMES for part in file_path.parts):
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


def find_duplicate_reason(data, model_id, existing_index):
    model_name = data.get('modelId') or data.get('id', '')
    url = f"https://huggingface.co/{model_name}"

    normalized_name = normalize_text(model_name)
    normalized_id = normalize_text(model_id)
    normalized_url = normalize_url(url)

    if normalized_url and (
        normalized_url in existing_index["sources"]
        or normalized_url in existing_index["links"]
    ):
        return "source"

    if normalized_name and (
        normalized_name in existing_index["titles"]
        or normalized_name in existing_index["tags"]
    ):
        return "title"

    if normalized_id and normalized_id in existing_index["tags"]:
        return "tag"

    return None


def find_existing_match_path(poster, model_id, existing_lookup):
    front = poster.get("front", {})
    meta = poster.get("meta", {})
    back = poster.get("back", {})

    title = front.get("title", "")
    source = meta.get("source", "")

    normalized_title = normalize_text(title)
    normalized_id = normalize_text(model_id)
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

    if normalized_id and normalized_id in existing_lookup["tags"]:
        return existing_lookup["tags"][normalized_id]

    return None


def determine_category(category_type, category_label=None):
    """Determine category based on model type"""
    if category_label:
        return [category_label]

    categories_map = {
        'popular': ['Popular Models', 'Hugging Face'],
        'text-generation': ['Text Generation', 'LLMs'],
        'image': ['Image Models', 'Computer Vision'],
        'nlp': ['NLP Models', 'Language'],
        'multimodal': ['Multimodal', 'Vision-Language']
    }
    return categories_map.get(category_type, ['AI Models', 'Hugging Face'])


def create_poster_from_huggingface(model_id, category_type, existing_index, category_label=None):
    """Convert Hugging Face model data to poster schema v2"""
    data = fetch_huggingface_model(model_id)
    
    if not data:
        return None, None
    
    duplicate_reason = find_duplicate_reason(data, model_id, existing_index)

    # Extract model info
    model_name = data.get('modelId') or data.get('id', model_id)
    author = data.get('author', 'Unknown')
    
    # Create a display name
    display_name = model_name.split('/')[-1] if '/' in model_name else model_name
    display_name = display_name.replace('-', ' ').replace('_', ' ').title()
    
    # Get description
    description = data.get('cardData', {}).get('description', '')
    if not description:
        description = f"Model by {author}"
    
    # Get tags and pipeline info
    tags = data.get('tags', [])
    pipeline_tag = data.get('pipeline_tag', '')
    
    # Build subtitle
    subtitle_parts = []
    if pipeline_tag:
        subtitle_parts.append(pipeline_tag.replace('-', ' ').title())
    if author:
        subtitle_parts.append(f"by {author}")
    subtitle = ' • '.join(subtitle_parts) if subtitle_parts else description[:100]
    
    # Get downloads and likes
    downloads = data.get('downloads', 0)
    likes = data.get('likes', 0)
    
    # Build description text
    text_parts = []
    if description:
        text_parts.append(description)
    text_parts.append(f"\n**Statistics:**")
    text_parts.append(f"- Downloads: {downloads:,}")
    text_parts.append(f"- Likes: {likes}")
    if pipeline_tag:
        text_parts.append(f"- Task: {pipeline_tag}")
    if tags:
        text_parts.append(f"- Tags: {', '.join(tags[:5])}")
    
    extract = '\n'.join(text_parts)
    
    # Build the poster object
    poster = {
        "version": 2,
        "type": "poster-v2",
        "uid": str(uuid.uuid4()),
        "front": {
            "title": display_name,
            "subtitle": subtitle
        },
        "back": {
            "layout": "text-only",
            "text": extract,
            "links": [
                {
                    "type": "external",
                    "label": "View on Hugging Face",
                    "url": f"https://huggingface.co/{model_name}",
                    "primary": True
                }
            ]
        },
        "meta": {
            "created": datetime.now().isoformat(),
            "modified": datetime.now().isoformat(),
            "categories": determine_category(category_type, category_label),
            "tags": [model_name] + tags[:3],
            "source": f"https://huggingface.co/{model_name}"
        }
    }
    
    # Add created date if available
    created_at = data.get('createdAt')
    if created_at:
        try:
            year = int(created_at[:4])
            poster['front']['chronology'] = {
                "epochStart": year,
                "epochEnd": datetime.now().year,
                "epochEvents": [
                    {
                        "year": year,
                        "name": f"Model released on Hugging Face"
                    }
                ]
            }
        except (ValueError, TypeError):
            pass
    
    return poster, duplicate_reason


def save_poster(poster, filename):
    """Save poster to JSON file"""
    OUTPUT_DIR.mkdir(exist_ok=True)
    filepath = OUTPUT_DIR / filename
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(poster, f, indent=2, ensure_ascii=True)
    
    print(f"Created: {filename}")


def save_existing_poster(filepath, poster):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(poster, f, indent=2, ensure_ascii=True)


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


def generate_all_posters(merge_enrich=True, merge_only=False, category_label=None, 
                        topics_override=None, count=None, search_query=None, task_filter=None):
    """Generate all posters from Hugging Face models"""
    existing_index, existing_lookup = build_existing_index()

    # Determine which models to fetch
    if topics_override:
        models = [model for model in topics_override if model]
        if count:
            models = models[:count]
        category_prefix = normalize_text(category_label or "category") or "hf"
        all_models = [(category_prefix, models, category_label)]
    elif search_query or task_filter:
        # Search for models
        found_models = search_huggingface_models(search_query, task_filter, limit=count or 20)
        category_prefix = "search"
        all_models = [(category_prefix, found_models, category_label)]
    else:
        # Use curated lists
        all_models = [
            ('popular', POPULAR_MODELS, None),
            ('text-generation', TEXT_GENERATION_MODELS, None),
            ('image', IMAGE_MODELS, None),
            ('nlp', NLP_MODELS, None),
            ('multimodal', MULTIMODAL_MODELS, None)
        ]
    
    total_created = 0
    total_failed = 0
    total_skipped = 0
    total_merged = 0
    merged_paths = []
    
    print(f"Starting Hugging Face poster generation...")
    print(f"Output directory: {OUTPUT_DIR.absolute()}\n")
    
    for category_type, models, category_label_item in all_models:
        display_label = category_label_item or category_type
        print(f"\n{'='*60}")
        print(f"Processing {display_label.upper()} ({len(models)} models)")
        print(f"{'='*60}")
        
        for i, model_id in enumerate(models, 1):
            print(f"[{i}/{len(models)}] Fetching: {model_id}... ", end='')
            
            poster, duplicate_reason = create_poster_from_huggingface(
                model_id,
                category_type,
                existing_index,
                category_label=category_label_item
            )

            if poster and not duplicate_reason:
                if merge_only:
                    print("SKIP create (merge-only)")
                    total_skipped += 1
                    continue
                # Create safe filename
                safe_model = model_id.replace('/', '_').replace('(', '').replace(')', '')
                safe_model = to_ascii(safe_model)
                if not safe_model:
                    safe_model = normalize_text(model_id) or "model"
                filename = f"hf_{category_type}_{safe_model}.json"
                save_poster(poster, filename)
                total_created += 1
                existing_index["titles"].add(normalize_text(poster.get("front", {}).get("title")))
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
                print(f"Failed")
                total_failed += 1
            
            # Be respectful to Hugging Face servers
            if i < len(models):
                time.sleep(DELAY_BETWEEN_REQUESTS)
    
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"Created: {total_created} posters")
    print(f"SKIP duplicates: {total_skipped} posters")
    print(f"MERGE enriched: {total_merged} posters")
    print(f"Failed: {total_failed} posters")
    print(f"Output directory: {OUTPUT_DIR.absolute()}")
    print(f"\nTotal models attempted: {total_created + total_failed + total_skipped + total_merged}")

    if merged_paths:
        OUTPUT_DIR.mkdir(exist_ok=True)
        with open(MERGE_LOG_PATH, "a", encoding="utf-8") as log_file:
            log_file.write(f"{datetime.now().isoformat()}\n")
            for path in merged_paths:
                log_file.write(f"{path}\n")
            log_file.write("\n")
        print(f"Merge log: {MERGE_LOG_PATH.absolute()}")


def main():
    """Main entry point"""
    args = parse_args()
    merge_enrich = MERGE_ENRICH
    merge_only = False

    if args.merge_enrich is not None:
        merge_enrich = args.merge_enrich == "true"
    if args.merge_only is not None:
        merge_only = args.merge_only == "true"

    topics_override = None
    if args.topics:
        topics_override = [
            topic.strip()
            for topic in re.split(r"[\n,]", args.topics)
            if topic.strip()
        ]

    print("="*60)
    print("HUGGING FACE POSTER GENERATOR")
    print("Fetching data from Hugging Face API")
    print("="*60)
    
    generate_all_posters(
        merge_enrich=merge_enrich,
        merge_only=merge_only,
        category_label=args.category,
        topics_override=topics_override,
        count=args.count,
        search_query=args.search,
        task_filter=args.filter
    )
    
    print("\nDone!")


if __name__ == "__main__":
    main()
