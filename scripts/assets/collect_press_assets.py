import argparse
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
OUT_ROOT = ROOT / "data" / "assets"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0 Safari/537.36"
    )
}


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9가-힣]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-") or "asset"


def guess_ext(url: str, content_type: str = "") -> str:
    path = urlparse(url).path.lower()

    for ext in [".jpg", ".jpeg", ".png", ".webp", ".avif"]:
        if ext in path:
            return ".jpg" if ext == ".jpeg" else ext

    if "png" in content_type:
        return ".png"
    if "webp" in content_type:
        return ".webp"
    if "avif" in content_type:
        return ".avif"

    return ".jpg"


def extract_image_urls(html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    urls: set[str] = set()

    # img src / data-src / srcset
    for img in soup.find_all("img"):
        for attr in ["src", "data-src", "data-original", "data-lazy-src"]:
            value = img.get(attr)
            if value:
                urls.add(urljoin(base_url, value))

        srcset = img.get("srcset")
        if srcset:
            for part in srcset.split(","):
                candidate = part.strip().split(" ")[0]
                if candidate:
                    urls.add(urljoin(base_url, candidate))

    # anchor links to images
    for a in soup.find_all("a"):
        href = a.get("href")
        if href and re.search(r"\.(jpg|jpeg|png|webp|avif)(\?|$)", href, re.I):
            urls.add(urljoin(base_url, href))

    # meta og:image / twitter:image
    for meta in soup.find_all("meta"):
        prop = meta.get("property") or meta.get("name")
        content = meta.get("content")
        if prop and content and prop.lower() in [
            "og:image",
            "twitter:image",
            "image",
        ]:
            urls.add(urljoin(base_url, content))

    # simple filter
    filtered = []
    for url in urls:
        low = url.lower()
        if any(x in low for x in ["logo", "favicon", "icon"]):
            continue
        if not any(x in low for x in [".jpg", ".jpeg", ".png", ".webp", ".avif", "image"]):
            continue
        filtered.append(url)

    return sorted(filtered)


def download_image(url: str, out_dir: Path, index: int) -> dict | None:
    try:
        response = requests.get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()
    except Exception as exc:
        print(f"skip download failed: {url} ({exc})")
        return None

    content_type = response.headers.get("content-type", "")
    if not content_type.startswith("image/"):
        # Some press image URLs may not expose content-type correctly,
        # but for v0.1 we keep it conservative.
        print(f"skip non-image content-type: {url} ({content_type})")
        return None

    ext = guess_ext(url, content_type)
    filename = f"asset_{index:02d}{ext}"
    out_path = out_dir / filename
    out_path.write_bytes(response.content)

    if out_path.stat().st_size < 20_000:
        print(f"skip tiny image: {url}")
        out_path.unlink(missing_ok=True)
        return None

    return {
        "index": index,
        "filename": filename,
        "path": str(out_path.relative_to(ROOT)),
        "source_url": url,
        "content_type": content_type,
        "size_bytes": out_path.stat().st_size,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("url", help="Press release or product page URL")
    parser.add_argument(
        "--product",
        default="sony-wh-1000xm6",
        help="output product slug",
    )
    parser.add_argument(
        "--max-images",
        type=int,
        default=20,
    )
    args = parser.parse_args()

    out_dir = OUT_ROOT / slugify(args.product)
    out_dir.mkdir(parents=True, exist_ok=True)

    response = requests.get(args.url, headers=HEADERS, timeout=30)
    response.raise_for_status()

    image_urls = extract_image_urls(response.text, args.url)
    print(f"found image urls: {len(image_urls)}")

    assets = []
    for idx, image_url in enumerate(image_urls[: args.max_images], start=1):
        print(f"[{idx}] {image_url}")
        asset = download_image(image_url, out_dir, idx)
        if asset:
            assets.append(asset)

    manifest = {
        "product": args.product,
        "source_page": args.url,
        "asset_count": len(assets),
        "assets": assets,
    }

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print()
    print(f"saved manifest: {manifest_path}")
    print(f"downloaded assets: {len(assets)}")


if __name__ == "__main__":
    main()
