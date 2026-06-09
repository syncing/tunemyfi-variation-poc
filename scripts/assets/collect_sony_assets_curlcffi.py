import argparse
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from curl_cffi import requests

ROOT = Path(__file__).resolve().parents[2]
OUT_ROOT = ROOT / "data" / "assets"


def slugify(text: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9가-힣]+", "-", text.lower())).strip("-")


def extract_urls(html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    urls = set()

    for tag in soup.find_all(["img", "source"]):
        for attr in ["src", "data-src", "data-original", "srcset"]:
            val = tag.get(attr)
            if not val:
                continue
            for part in val.split(","):
                u = part.strip().split(" ")[0]
                if u:
                    urls.add(urljoin(base_url, u))

    for a in soup.find_all("a"):
        href = a.get("href")
        if href:
            urls.add(urljoin(base_url, href))

    return sorted(
        u for u in urls
        if re.search(r"\.(jpg|jpeg|png|webp|avif)(\?|$)", u, re.I)
        or "/media/" in u.lower()
        or "image" in u.lower()
    )


def ext_from(url: str, ctype: str) -> str:
    path = urlparse(url).path.lower()
    for ext in [".jpg", ".jpeg", ".png", ".webp", ".avif"]:
        if ext in path:
            return ".jpg" if ext == ".jpeg" else ext
    if "png" in ctype:
        return ".png"
    if "webp" in ctype:
        return ".webp"
    if "avif" in ctype:
        return ".avif"
    return ".jpg"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--product", default="sony-wh-1000xm6")
    ap.add_argument("--max-images", type=int, default=40)
    args = ap.parse_args()

    out_dir = OUT_ROOT / slugify(args.product)
    out_dir.mkdir(parents=True, exist_ok=True)

    headers = {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "referer": "https://www.sony.eu/",
        "upgrade-insecure-requests": "1",
    }

    r = requests.get(
        args.url,
        headers=headers,
        impersonate="chrome120",
        timeout=60,
    )

    print("status:", r.status_code)
    print("content-type:", r.headers.get("content-type"))

    html_path = out_dir / "page.html"
    html_path.write_text(r.text, encoding="utf-8", errors="ignore")

    if r.status_code != 200 or "Access Denied" in r.text:
        print("blocked. saved page:", html_path)
        return

    urls = extract_urls(r.text, args.url)
    print("candidate urls:", len(urls))

    assets = []

    for i, u in enumerate(urls[: args.max_images], 1):
        try:
            img = requests.get(
                u,
                headers={**headers, "referer": args.url},
                impersonate="chrome120",
                timeout=60,
            )
            ctype = img.headers.get("content-type", "")
            if img.status_code != 200 or not ctype.startswith("image/"):
                print("skip:", img.status_code, ctype, u)
                continue

            ext = ext_from(u, ctype)
            filename = f"asset_{i:02d}{ext}"
            path = out_dir / filename
            path.write_bytes(img.content)

            if path.stat().st_size < 20_000:
                path.unlink(missing_ok=True)
                print("skip tiny:", u)
                continue

            print("saved:", filename, path.stat().st_size)

            assets.append({
                "index": i,
                "filename": filename,
                "path": str(path.relative_to(ROOT)),
                "source_url": u,
                "content_type": ctype,
                "size_bytes": path.stat().st_size,
            })
        except Exception as e:
            print("error:", u, e)

    manifest = {
        "product": args.product,
        "source_page": args.url,
        "asset_count": len(assets),
        "assets": assets,
    }

    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("downloaded:", len(assets))
    print("manifest:", out_dir / "manifest.json")


if __name__ == "__main__":
    main()
