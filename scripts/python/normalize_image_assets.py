#!/usr/bin/env python3
"""
Normalize poster image assets:
- Convert referenced local images to .webp
- Update poster JSON image paths to .webp
- Apply aspect-based fit rules (fit/maxWidth/maxHeight) to back images

Default roots:
- JSON_Posters
- ai_posters
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SCAN_DIRS = [Path("JSON_Posters"), Path("ai_posters")]
LOCAL_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tif", ".tiff", ".webp"}


def build_image_fit_config(width: Optional[int], height: Optional[int]) -> Dict[str, Any]:
    default = {"fit": "contain", "maxWidth": 92, "maxHeight": 92}
    if not width or not height or width <= 0 or height <= 0:
        return default

    ratio = width / height
    if 1.65 <= ratio <= 1.90:
        return {"fit": "contain", "maxWidth": 96, "maxHeight": 96}
    if ratio > 1.90:
        return {"fit": "contain", "maxWidth": 96, "maxHeight": 82}
    if ratio < 0.95:
        return {"fit": "contain", "maxWidth": 72, "maxHeight": 96}
    return {"fit": "contain", "maxWidth": 86, "maxHeight": 92}


def is_remote_url(src: str) -> bool:
    value = src.lower().strip()
    return value.startswith("http://") or value.startswith("https://") or value.startswith("data:")


def resolve_local_path(src: str) -> Optional[Path]:
    if not src:
        return None
    raw = src.strip().replace("\\", "/")
    if raw.startswith("/"):
        raw = raw[1:]
    path = PROJECT_ROOT / raw
    return path if path.exists() else None


def ensure_webp(local_path: Path, quality: int = 88) -> Tuple[Path, bool]:
    if local_path.suffix.lower() == ".webp":
        return local_path, False

    target = local_path.with_suffix(".webp")
    if target.exists():
        return target, False

    with Image.open(local_path) as img:
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
        else:
            img = img.convert("RGB")
        img.save(target, "WEBP", quality=quality, method=6)
    return target, True


def image_dimensions(local_path: Path) -> Tuple[Optional[int], Optional[int]]:
    try:
        with Image.open(local_path) as img:
            return img.width, img.height
    except Exception:
        return None, None


def rel_src_from_path(path: Path) -> str:
    return path.relative_to(PROJECT_ROOT).as_posix()


def update_image_block(block: Dict[str, Any], counters: Dict[str, int]) -> bool:
    changed = False
    src = str(block.get("src") or "").strip()
    if not src:
        return False

    width = None
    height = None

    if not is_remote_url(src):
        local = resolve_local_path(src)
        if local:
            new_local, converted = ensure_webp(local)
            if converted:
                counters["converted_to_webp"] += 1
            if new_local != local:
                new_src = rel_src_from_path(new_local)
                if block.get("src") != new_src:
                    block["src"] = new_src
                    changed = True
                    counters["src_updated"] += 1
                local = new_local

            width, height = image_dimensions(local)
        else:
            counters["missing_local_paths"] += 1
    else:
        counters["remote_images"] += 1

    fit_cfg = build_image_fit_config(width, height)
    for key in ("fit", "maxWidth", "maxHeight"):
        if block.get(key) != fit_cfg[key]:
            block[key] = fit_cfg[key]
            changed = True
            counters["fit_updated"] += 1

    return changed


def process_poster_json(path: Path, counters: Dict[str, int]) -> bool:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        counters["json_read_errors"] += 1
        return False

    changed = False

    back = data.get("back")
    if isinstance(back, dict):
        image = back.get("image")
        if isinstance(image, dict):
            if update_image_block(image, counters):
                changed = True

        images = back.get("images")
        if isinstance(images, list):
            for item in images:
                if isinstance(item, dict):
                    if update_image_block(item, counters):
                        changed = True

    front = data.get("front")
    if isinstance(front, dict):
        thumb = front.get("thumbnail")
        if isinstance(thumb, str) and thumb and not is_remote_url(thumb):
            local = resolve_local_path(thumb)
            if local:
                new_local, converted = ensure_webp(local)
                if converted:
                    counters["converted_to_webp"] += 1
                new_src = rel_src_from_path(new_local)
                if front.get("thumbnail") != new_src:
                    front["thumbnail"] = new_src
                    changed = True
                    counters["src_updated"] += 1
            else:
                counters["missing_local_paths"] += 1

    if changed:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        counters["json_updated"] += 1
    return changed


def find_json_files(scan_dirs: List[Path]) -> List[Path]:
    files: List[Path] = []
    for rel_dir in scan_dirs:
        root = PROJECT_ROOT / rel_dir
        if not root.exists():
            continue
        files.extend(root.rglob("*.json"))
    return files


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize poster image assets and fit metadata.")
    parser.add_argument(
        "--dirs",
        nargs="*",
        default=[d.as_posix() for d in DEFAULT_SCAN_DIRS],
        help="Directories to scan (relative to project root).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    scan_dirs = [Path(d) for d in args.dirs]
    json_files = find_json_files(scan_dirs)

    counters: Dict[str, int] = {
        "json_files": len(json_files),
        "json_updated": 0,
        "converted_to_webp": 0,
        "src_updated": 0,
        "fit_updated": 0,
        "remote_images": 0,
        "missing_local_paths": 0,
        "json_read_errors": 0,
    }

    for path in json_files:
        process_poster_json(path, counters)

    print("Image normalization complete")
    print(f"JSON files scanned: {counters['json_files']}")
    print(f"JSON files updated: {counters['json_updated']}")
    print(f"Local images converted to webp: {counters['converted_to_webp']}")
    print(f"Image src fields updated: {counters['src_updated']}")
    print(f"Fit fields updated: {counters['fit_updated']}")
    print(f"Remote image refs seen: {counters['remote_images']}")
    print(f"Missing local image paths: {counters['missing_local_paths']}")
    print(f"JSON read errors: {counters['json_read_errors']}")


if __name__ == "__main__":
    main()

