#!/usr/bin/env python3
"""Verify raw static route HTML contains route-specific SEO tags."""
from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://novakingdomrentals.com"
REQUIRED_META = [
    'name="description"',
    'property="og:title"',
    'property="og:description"',
    'property="og:image"',
    'property="og:url"',
    'name="twitter:title"',
    'name="twitter:description"',
    'name="twitter:image"',
    'rel="canonical"',
]


def output_path(route: str) -> Path:
    return ROOT / "index.html" if route == "/" else ROOT / route.strip("/") / "index.html"


def attr_value(html: str, pattern: str) -> str | None:
    match = re.search(pattern, html, re.S)
    return unescape(match.group(1)) if match else None


def sitemap_routes() -> list[str]:
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    root = ET.parse(ROOT / "sitemap.xml").getroot()
    routes = []
    for loc in root.findall("s:url/s:loc", ns):
        route = loc.text.replace(BASE_URL, "") or "/"
        if route != "/llms.txt":
            routes.append(route)
    return routes


def main() -> int:
    failures: list[str] = []
    for route in sitemap_routes():
        path = output_path(route)
        if not path.exists():
            failures.append(f"{route}: missing {path.relative_to(ROOT)}")
            continue
        raw = path.read_text(encoding="utf-8")
        for token in REQUIRED_META:
            if token not in raw:
                failures.append(f"{route}: missing {token}")
        expected_url = f"{BASE_URL}{route}"
        canonical = attr_value(raw, r'<link rel="canonical" href="([^"]+)"')
        og_url = attr_value(raw, r'<meta property="og:url" content="([^"]+)"')
        title = attr_value(raw, r'<title>(.*?)</title>')
        og_title = attr_value(raw, r'<meta property="og:title" content="([^"]+)"')
        twitter_title = attr_value(raw, r'<meta name="twitter:title" content="([^"]+)"')
        og_image = attr_value(raw, r'<meta property="og:image" content="([^"]+)"')
        if canonical != expected_url:
            failures.append(f"{route}: canonical {canonical!r} != {expected_url!r}")
        if og_url != expected_url:
            failures.append(f"{route}: og:url {og_url!r} != {expected_url!r}")
        if not title or title != og_title or title != twitter_title:
            failures.append(f"{route}: title/og/twitter title mismatch")
        if not og_image or not og_image.startswith(f"{BASE_URL}/images/"):
            failures.append(f"{route}: invalid og:image {og_image!r}")
        elif not (ROOT / og_image.replace(f"{BASE_URL}/", "").replace("%20", " ")).exists():
            failures.append(f"{route}: og:image file does not exist {og_image!r}")
        schema_blocks = re.findall(r'<script type="application/ld\+json">\s*(.*?)\s*</script>', raw, re.S)
        if not schema_blocks:
            failures.append(f"{route}: missing JSON-LD")
        for block in schema_blocks:
            try:
                json.loads(block)
            except json.JSONDecodeError as exc:
                failures.append(f"{route}: invalid JSON-LD: {exc}")
    if failures:
        print("Static route HTML verification failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print(f"Verified raw metadata for {len(sitemap_routes())} static routes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
