import argparse
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT_ROOT = ROOT / "data" / "assets"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0 Safari/537.36"
    ),
    "Referer": "https://www.sony.eu/",
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


def get_page_html(url: str) -> str:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=HEADERS["User-Agent"],
            viewport={"width": 1440, "height": 1200},
        )
        page.goto(url, wait_until="networkidle", timeout=60000)

        # 쿠키 배너가 있으면 대충 닫기 시도
        for text in ["Accept All", "Accept all", "동의", "허용", "Agree"]:
            try:
                page.get_by_text(text, exact=False).click(timeout=2000)
                break
            except Exception:
                pass

        page.wait_for_timeout(3000)
        html = page.content()
        browser.close()
        return html


def extract_image_urls(html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    urls: set[str] = set()

    for img in soup.find_all("img"):
        for attr in [
            "src",
            "data-src",
            "data-original",
            "data-lazy-src",
            "data-desktop-src",
            "data-mobile-src",
        ]:
            value = img.get(attr)
            if value:
                urls.add(urljoin(base_url, value))

        srcset = img.get("srcset")
        if srcset:
            for part in srcset.split(","):
                candidate = part.strip().split(" ")[0]
                if candidate:
                    urls.add(urljoin(base_url, candidate))

    for source in soup.find_all("source"):
        srcset = source.get("srcset")
        if srcset:
            for part in srcset.split(","):
                candidate = part.strip().split(" ")[0]
                if candidate:
                    urls.add(urljoin(base_url, candidate))

    for a in soup.find_all("a"):
        href = a.get("href")
        if href and re.search(r"\.(jpg|jpeg|png|webp|avif)(\?|$)", href, re.I):
            urls.add(urljoin(base_url, href))

    for meta in soup.find_all("meta"):
        prop = meta.get("property") or meta.get("name")
        content = meta.get("content")
        if prop and content and prop.lower() in [
            "og:image",
            "twitter:image",
            "image",
        ]:
            urls.add(urljoin(base_url, content))

    filtered = []
    for url in urls:
        low = url.lower()
        if any(x in low for x in ["logo", "favicon", "sprite", "icon"]):
            continue
        if any(x in low for x in [".jpg", ".jpeg", ".png", ".webp", ".avif", "image"]):
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
    parser.add_argument("url")
    parser.add_argument("--product", default="sony-wh-1000xm6")
    parser.add_argument("--max-images", type=int, default=20)
    args = parser.parse_args()

    out_dir = OUT_ROOT / slugify(args.product)
    out_dir.mkdir(parents=True, exist_ok=True)

    html = get_page_html(args.url)
    (out_dir / "page.html").write_text(html, encoding="utf-8")

    image_urls = extract_image_urls(html, args.url)
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
