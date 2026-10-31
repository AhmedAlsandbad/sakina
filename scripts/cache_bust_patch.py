#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected token not found in {path}: {old}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(ROOT / "index.html", 'data.js?v=38', 'data.js?v=39')
replace_once(ROOT / "sw.js", 'const V = "sakina-v50";', 'const V = "sakina-v51";')
replace_once(ROOT / "sw.js", 'data.js?v=38', 'data.js?v=39')
print("Static data cache-bust applied")
