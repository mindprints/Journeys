#!/usr/bin/env python3
"""
Repair missing local image references in poster JSON files.

Strategy:
1) If missing path is a template example image, create placeholder webp.
2) Otherwise search repo for same basename with common image extensions.
3) If found and not webp, convert to webp and update JSON src.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image, ImageDraw


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCAN_DIRS = [PROJECT_ROOT / "JSON_Posters", PROJECT_ROOT / "ai_posters"]
EXT_PRIORITY = [".webp", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff"]


def is_remote(src: str) -> bool:
    s = (src or "").lower().strip()
    return s.startswith("http://") or s.startswith("https://") or s.startswith("data:")


def to_local_path(src: str) -> Path:
    s = src.replace("\\", "/").strip()
    if s.startswith("/"):
        s = s[1:]
    return PROJECT_ROOT / s


def to_rel_src(path: Path) -> str:
    return path.relative_to(PROJECT_ROOT).as_posix()


def ensure_webp(path: Path, quality: int = 88) -> Path:
    if path.suffix.lower() == ".webp":
        return path
    target = path.with_suffix(".webp")
    if target.exists():
        return target
    with Image.open(path) as img:
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
        else:
            img = img.convert("RGB")
        img.save(target, "WEBP", quality=quality, method=6)
    return target


def create_template_placeholder(target: Path, label: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        return
    img = Image.new("RGB", (1280, 720), (28, 33, 44))
    draw = ImageDraw.Draw(img)
    draw.rectangle((40, 40, 1240, 680), outline=(110, 180, 255), width=4)
    draw.text((80, 320), f"Template Image: {label}", fill=(220, 230, 245))
    img.save(target, "WEBP", quality=86, method=6)


def create_fallback_placeholder(target: Path, label: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        return
    img = Image.new("RGB", (1280, 720), (24, 28, 36))
    draw = ImageDraw.Draw(img)
    draw.rectangle((30, 30, 1250, 690), outline=(244, 140, 6), width=4)
    draw.text((70, 320), f"Missing source repaired: {label}", fill=(235, 235, 235))
    img.save(target, "WEBP", quality=86, method=6)


def find_candidate_by_basename(stem: str, missing_path: Path) -> Optional[Path]:
    candidates: List[Path] = []
    for ext in EXT_PRIORITY:
        candidates.extend(PROJECT_ROOT.rglob(f"{stem}{ext}"))
    if not candidates:
        return None

    # Prefer in images/originals and avoid the exact missing path.
    candidates = [c for c in candidates if c.resolve() != missing_path.resolve()]
    if not candidates:
        return None

    candidates.sort(key=lambda p: (0 if "images/originals" in p.as_posix() else 1, len(p.as_posix())))
    return candidates[0]


def maybe_repair_src(src: str, json_path: Path, counters: Dict[str, int]) -> Tuple[str, bool]:
    if not src or is_remote(src):
        return src, False

    missing_local = to_local_path(src)
    if missing_local.exists():
        return src, False

    counters["missing_seen"] += 1

    rel = missing_local.relative_to(PROJECT_ROOT).as_posix()
    if rel in ("images/originals/example.webp", "images/originals/example-2.webp"):
        label = Path(rel).stem
        create_template_placeholder(missing_local, label)
        counters["template_placeholders_created"] += 1
        return rel, True

    candidate = find_candidate_by_basename(missing_local.stem, missing_local)
    if not candidate:
        fallback = (PROJECT_ROOT / "images" / "originals" / f"{missing_local.stem}.webp")
        create_fallback_placeholder(fallback, missing_local.stem)
        counters["fallback_placeholders_created"] += 1
        counters["repaired"] += 1
        return to_rel_src(fallback), True

    webp_path = ensure_webp(candidate)
    if webp_path != candidate:
        counters["converted_to_webp"] += 1
    counters["repaired"] += 1
    return to_rel_src(webp_path), True


def process_json(path: Path, counters: Dict[str, int]) -> None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        counters["json_read_errors"] += 1
        return

    changed = False

    def handle_image_block(block: Dict[str, Any]) -> None:
        nonlocal changed
        src = block.get("src")
        if isinstance(src, str):
            new_src, repaired = maybe_repair_src(src, path, counters)
            if repaired and new_src != src:
                block["src"] = new_src
                changed = True

    back = data.get("back")
    if isinstance(back, dict):
        image = back.get("image")
        if isinstance(image, dict):
            handle_image_block(image)
        images = back.get("images")
        if isinstance(images, list):
            for item in images:
                if isinstance(item, dict):
                    handle_image_block(item)

    front = data.get("front")
    if isinstance(front, dict) and isinstance(front.get("thumbnail"), str):
        src = front["thumbnail"]
        new_src, repaired = maybe_repair_src(src, path, counters)
        if repaired and new_src != src:
            front["thumbnail"] = new_src
            changed = True

    if changed:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        counters["json_updated"] += 1


def main() -> None:
    counters: Dict[str, int] = {
        "json_scanned": 0,
        "json_updated": 0,
        "missing_seen": 0,
        "repaired": 0,
        "unrepaired": 0,
        "template_placeholders_created": 0,
        "fallback_placeholders_created": 0,
        "converted_to_webp": 0,
        "json_read_errors": 0,
    }

    for root in SCAN_DIRS:
        if not root.exists():
            continue
        for path in root.rglob("*.json"):
            counters["json_scanned"] += 1
            process_json(path, counters)

    print("Missing image reference repair complete")
    for key in (
        "json_scanned",
        "json_updated",
        "missing_seen",
        "repaired",
        "unrepaired",
        "template_placeholders_created",
        "fallback_placeholders_created",
        "converted_to_webp",
        "json_read_errors",
    ):
        print(f"{key}: {counters[key]}")


if __name__ == "__main__":
    main()
