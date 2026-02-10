#!/usr/bin/env python3
"""
Unified poster grabber.
"""

import argparse
from pathlib import Path
import re
import sys

from grab_common import build_existing_index
from sources import wikipedia, huggingface


SOURCES = {
    "wikipedia": wikipedia,
    "huggingface": huggingface,
    "hf": huggingface,
}


def parse_args():
    parser = argparse.ArgumentParser(description="Unified Poster Grabber")
    parser.add_argument(
        "--source", required=True, help="Source adapter (wikipedia, huggingface)"
    )
    parser.add_argument("--category", help="Custom category label")
    parser.add_argument("--topics", help="Comma or newline separated topics/model IDs")
    parser.add_argument("--count", type=int, help="Limit number of topics to process")
    parser.add_argument(
        "--merge-enrich", choices=["true", "false"], help="Enable merge enrichment"
    )
    parser.add_argument(
        "--merge-only", choices=["true", "false"], help="Skip creating new posters"
    )
    parser.add_argument("--search", help="Search query (source-specific)")
    parser.add_argument("--filter", help="Filter (source-specific)")
    parser.add_argument(
        "--use-curated", action="store_true", help="Use curated list for the source"
    )
    parser.add_argument("--curated-set", help="Curated set key (source-specific)")
    parser.add_argument(
        "--output-dir", default="ai_posters", help="Output directory for posters"
    )
    return parser.parse_args()


def parse_topics(raw):
    if not raw:
        return []
    return [topic.strip() for topic in re.split(r"[\n,]", raw) if topic.strip()]


def resolve_adapter(source):
    key = (source or "").strip().lower()
    return SOURCES.get(key)


def main():
    args = parse_args()
    adapter = resolve_adapter(args.source)
    if not adapter:
        print(f"Unknown source: {args.source}")
        print("Available sources: wikipedia, huggingface")
        sys.exit(1)

    merge_enrich = True
    merge_only = False
    if args.merge_enrich is not None:
        merge_enrich = args.merge_enrich == "true"
    if args.merge_only is not None:
        merge_only = args.merge_only == "true"

    output_dir = Path(args.output_dir)
    existing_roots = [Path("JSON_Posters"), Path("backups")]
    existing_index, existing_lookup = build_existing_index(existing_roots)

    topics = parse_topics(args.topics)
    category_label = args.category
    category_type = "category"

    if args.use_curated:
        if not hasattr(adapter, "get_curated_sets"):
            print(f"Source does not support curated sets: {args.source}")
            sys.exit(1)
        curated_sets = adapter.get_curated_sets()
        if not args.curated_set:
            print("Curated set required. Available:")
            for key in curated_sets.keys():
                print(f"- {key}")
            sys.exit(1)
        if args.curated_set not in curated_sets:
            print(f"Unknown curated set: {args.curated_set}")
            print("Available sets:")
            for key in curated_sets.keys():
                print(f"- {key}")
            sys.exit(1)
        topics = curated_sets[args.curated_set]
        category_type = args.curated_set
    elif args.search or args.filter:
        search_fn = getattr(adapter, "search_items", None)
        if not search_fn:
            print(f"Source does not support search: {args.source}")
            sys.exit(1)
        topics = search_fn(args.search, args.filter, limit=args.count or 20)
        category_type = "search"

    if not topics:
        print("No topics provided. Use --topics, --search, or --use-curated.")
        sys.exit(1)

    print("=" * 60)
    print("UNIFIED POSTER GRABBER")
    print(f"Source: {args.source}")
    print("=" * 60)

    adapter.generate_posters(
        topics,
        category_label=category_label,
        count=args.count,
        merge_enrich=merge_enrich,
        merge_only=merge_only,
        output_dir=output_dir,
        existing_index=existing_index,
        existing_lookup=existing_lookup,
        category_type=category_type,
        existing_roots=existing_roots,
    )

    print("\nDone!")


if __name__ == "__main__":
    main()
