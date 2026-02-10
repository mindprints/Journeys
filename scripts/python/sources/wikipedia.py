#!/usr/bin/env python3
"""Wikipedia source adapter."""

from datetime import datetime
from pathlib import Path
import requests
import time
import re
import json
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


SOURCE_NAME = "wikipedia"
DEFAULT_OUTPUT_DIR = Path("ai_posters")
DEFAULT_EXISTING_ROOTS = [Path("JSON_Posters"), Path("backups")]
DEFAULT_DELAY = 1


# Curated topic lists (optional)
AI_PIONEERS = [
    "Alan_Turing",
    "John_McCarthy_(computer_scientist)",
    "Marvin_Minsky",
    "Geoffrey_Hinton",
    "Yann_LeCun",
    "Yoshua_Bengio",
    "Andrew_Ng",
    "Fei-Fei_Li",
    "Demis_Hassabis",
    "Ilya_Sutskever",
    "Jurgen_Schmidhuber",
    "Stuart_Russell",
    "Peter_Norvig",
    "Judea_Pearl",
    "Michael_I._Jordan",
    "Ian_Goodfellow",
    "Andrej_Karpathy",
    "Daphne_Koller",
    "Jeff_Dean_(computer_scientist)",
    "Turing_Award",
]

AI_MODELS = [
    "Perceptron",
    "Backpropagation",
    "Convolutional_neural_network",
    "Recurrent_neural_network",
    "Long_short-term_memory",
    "Generative_adversarial_network",
    "Transformer_(machine_learning_model)",
    "BERT_(language_model)",
    "GPT-3",
    "GPT-4",
    "Diffusion_model",
    "Autoencoder",
    "ResNet",
    "AlexNet",
    "U-Net",
    "DALL-E",
    "Stable_Diffusion",
    "Neural_Turing_machine",
    "Attention_(machine_learning)",
    "Word2vec",
]

AI_CONCEPTS = [
    "Artificial_intelligence",
    "Machine_learning",
    "Deep_learning",
    "Neural_network",
    "Reinforcement_learning",
    "Supervised_learning",
    "Unsupervised_learning",
    "Natural_language_processing",
    "Computer_vision",
    "Transfer_learning",
    "Few-shot_learning",
    "Artificial_neural_network",
    "Gradient_descent",
    "Overfitting",
    "Regularization_(mathematics)",
    "Batch_normalization",
    "Dropout_(neural_networks)",
    "Activation_function",
    "Loss_function",
    "Mathematical_optimization",
]

AI_COMPANIES = [
    "OpenAI",
    "DeepMind",
    "Anthropic",
    "Google_AI",
    "Meta_AI",
    "IBM_Watson",
    "Microsoft_Research",
    "Allen_Institute_for_AI",
    "Hugging_Face",
    "Stability_AI",
]

AI_LANDMARKS = [
    "Dartmouth_workshop",
    "ImageNet",
    "AlphaGo",
    "Deep_Blue_(chess_computer)",
    "Watson_(computer)",
    "ChatGPT",
    "AI_winter",
    "Turing_test",
    "Chinese_room",
    "AI_alignment",
]


def get_curated_sets():
    return {
        "pioneers": AI_PIONEERS,
        "models": AI_MODELS,
        "concepts": AI_CONCEPTS,
        "companies": AI_COMPANIES,
        "landmarks": AI_LANDMARKS,
    }


def fetch_wikipedia_summary(topic):
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{topic}"
    headers = {
        "User-Agent": "AI-Poster-Generator/1.0 (Educational Project; mindp@example.com)"
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Error fetching {topic}: {e}")
        return None


def extract_year_from_text(text):
    years = re.findall(r"\b(19\d{2}|20\d{2})\b", text)
    return int(years[0]) if years else None


def determine_category(topic_list_name, category_label=None):
    if category_label:
        return [category_label]

    categories_map = {
        "pioneers": ["AI Pioneers", "People"],
        "models": ["AI Models", "Machine Learning"],
        "concepts": ["AI Concepts", "Theory"],
        "companies": ["AI Companies", "Organizations"],
        "landmarks": ["AI History", "Milestones"],
    }
    return categories_map.get(topic_list_name, ["Artificial Intelligence"])


def create_poster_from_wikipedia(
    topic, category_type, existing_index, category_label=None
):
    data = fetch_wikipedia_summary(topic)

    if not data:
        return None, None

    title = data.get("title", "")
    url = data.get("content_urls", {}).get("desktop", {}).get("page", "")
    duplicate_reason = find_duplicate_reason(title, topic, url, existing_index)

    description = data.get("description", "")
    extract = data.get("extract", "")

    subtitle = (
        description
        if description
        else extract[:100] + "..."
        if len(extract) > 100
        else extract
    )

    poster = {
        "version": 2,
        "type": "poster-v2",
        "uid": str(uuid.uuid4()),
        "front": {
            "title": title,
            "subtitle": subtitle,
        },
        "back": {
            "layout": "image-top" if data.get("thumbnail") else "text-only",
            "text": extract,
            "links": [
                {
                    "type": "external",
                    "label": "Read more on Wikipedia",
                    "url": url,
                    "primary": True,
                }
            ],
        },
        "meta": {
            "created": datetime.now().isoformat(),
            "modified": datetime.now().isoformat(),
            "categories": determine_category(category_type, category_label),
            "tags": [topic.replace("_", " ")],
            "source": url,
        },
    }

    if data.get("thumbnail"):
        poster["back"]["image"] = {
            "src": data["thumbnail"].get("source", ""),
            "alt": title,
            "position": "top",
        }

    if category_type == "pioneers" and "extract" in data:
        year = extract_year_from_text(extract)
        if year:
            poster["front"]["chronology"] = {
                "epochStart": year,
                "epochEnd": datetime.now().year,
                "epochEvents": [
                    {
                        "year": year,
                        "name": f"Birth/Founding of {title}",
                    }
                ],
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

    topics = [topic for topic in topics if topic]
    if count:
        topics = topics[:count]

    total_created = 0
    total_failed = 0
    total_skipped = 0
    total_merged = 0
    merged_paths = []

    print("Starting poster generation...")
    print(f"Output directory: {output_dir.absolute()}\n")

    for i, topic in enumerate(topics, 1):
        print(f"[{i}/{len(topics)}] Fetching: {topic}... ", end="")

        poster, duplicate_reason = create_poster_from_wikipedia(
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
            safe_topic = topic.replace("/", "_").replace("(", "").replace(")", "")
            safe_topic = to_ascii(safe_topic)
            if not safe_topic:
                safe_topic = normalize_text(topic) or "topic"
            filename = f"wiki_{safe_topic}.json"
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
        merge_log_path = output_dir / "merge_enrichment.log"
        with open(merge_log_path, "a", encoding="utf-8") as log_file:
            log_file.write(f"{datetime.now().isoformat()}\n")
            for path in merged_paths:
                log_file.write(f"{path}\n")
            log_file.write("\n")
        print(f"Merge log: {merge_log_path.absolute()}")
