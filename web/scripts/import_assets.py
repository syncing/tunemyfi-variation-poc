import argparse, json, re, shutil, sys, time
from pathlib import Path
from urllib.parse import urljoin, urlparse
from curl_cffi import requests

def log(m): print(m, file=sys.stderr, flush=True)

def slug_safe(t):
    t = re.sub(r"[^a-z0-9가-힣]+", "-", t.strip().lower())
    return re.sub(r"-+", "-", t).strip("-") or "item"

def norm(u): return u.replace("\\u002F", "/").replace("\\/", "/")

def load_rules(name):
    p = Path.cwd() / "scripts" / "provider-rules" / f"{name}.json"
    return json.loads(p.read_text("utf-8"))

def extract_urls(html, base):
    urls = set()
    for m in re.findall(r'https?://[^"\'<>\s]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"\'<>\s]*)?', html, re.I):
        urls.add(norm(m))
    for m in re.findall(r'(?:src|href)=["\']([^"\']+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"\']*)?)["\']', html, re.I):
        urls.add(urljoin(base, norm(m)))
    for ss in re.findall(r'srcset=["\']([^"\']+)["\']', html, re.I):
        for part in ss.split(","):
            u = part.strip().split(" ")[0].strip()
            if u:
                urls.add(urljoin(base, norm(u)))
    return sorted(urls)

def url_ok(url, rules):
    lower = url.lower().split("?")[0]
    if not urlparse(url).scheme.startswith("http"):
        return False
    exts = rules.get("allowedExtensions", [])
    if exts and not any(lower.endswith("." + e.lower()) for e in exts):
        return False
    inc = [p.lower() for p in rules.get("includePatterns", [])]
    exc = [p.lower() for p in rules.get("excludePatterns", [])]
    full = url.lower()
    if inc and not any(p in full for p in inc):
        return False
    if exc and any(p in full for p in exc):
        return False
    return True

def content_ok(ct, rules):
    allowed = rules.get("allowedContentTypes", [])
    return not allowed or any(ct.lower().startswith(x.lower()) for x in allowed)

def ext_from_ct(ct):
    ct = ct.lower()
    if "png" in ct: return ".png"
    if "webp" in ct: return ".webp"
    if "avif" in ct: return ".avif"
    return ".jpg"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-url", required=True)
    ap.add_argument("--product-slug", required=True)
    ap.add_argument("--product-name", required=True)
    ap.add_argument("--resource-id", required=True)
    ap.add_argument("--resource-name", required=True)
    ap.add_argument("--rule", default="generic")
    ap.add_argument("--copyright-note", default="")
    ap.add_argument("--clean", action="store_true")
    args = ap.parse_args()

    product_slug = slug_safe(args.product_slug)
    resource_id = slug_safe(args.resource_id)
    rules = load_rules(args.rule)

    root = Path.cwd()
    public_dir = root / "public" / "product-assets" / product_slug / "resources" / resource_id
    data_product_dir = root / "data" / "product-assets" / product_slug
    data_resource_dir = data_product_dir / "resources" / resource_id

    if args.clean:
        shutil.rmtree(public_dir, ignore_errors=True)
        shutil.rmtree(data_resource_dir, ignore_errors=True)

    public_dir.mkdir(parents=True, exist_ok=True)
    data_resource_dir.mkdir(parents=True, exist_ok=True)

    session = requests.Session(impersonate="chrome120")
    headers = {
        "user-agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
        "referer": args.source_url,
    }

    log(f"PRODUCT={product_slug}")
    log(f"RESOURCE={resource_id}")
    log(f"RULE={args.rule}")

    page = session.get(args.source_url, headers={**headers, "accept": "text/html,*/*"}, timeout=30)
    if page.status_code >= 400:
        print(json.dumps({"error": f"HTTP {page.status_code}"}, ensure_ascii=False))
        sys.exit(1)

    candidates = extract_urls(page.text or "", args.source_url)
    filtered = [u for u in candidates if url_ok(u, rules)]

    log(f"FOUND_CANDIDATES={len(candidates)}")
    log(f"FILTERED_CANDIDATES={len(filtered)}")

    assets, sigs = [], set()
    min_bytes = int(rules.get("minBytes", 0))
    dedupe = bool(rules.get("dedupe", True))

    for i, url in enumerate(filtered, 1):
        log(f"TRY {i}/{len(filtered)} {url}")
        try:
            r = session.get(url, headers={**headers, "accept": "image/*,*/*;q=0.8"}, timeout=30)
        except Exception as e:
            log(f"SKIP_ERROR {e}")
            continue

        ct = r.headers.get("content-type", "")
        content = r.content or b""
        size = len(content)

        log(f"STATUS={r.status_code} TYPE={ct} SIZE={size}")

        if r.status_code >= 400 or not content_ok(ct, rules) or size < min_bytes:
            continue

        sig = (size, content[:64])
        if dedupe and sig in sigs:
            log("SKIP_DUPLICATE")
            continue
        sigs.add(sig)

        idx = len(assets) + 1
        ext = ext_from_ct(ct)
        filename = f"asset_{idx:02d}{ext}"
        (public_dir / filename).write_bytes(content)

        assets.append({
            "id": f"asset_{idx:02d}",
            "filename": filename,
            "publicPath": f"/product-assets/{product_slug}/resources/{resource_id}/{filename}",
            "sourceUrl": url,
            "contentType": ct,
            "sizeBytes": size,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        })

        log(f"SAVED {filename}")

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    resource_manifest = {
        "productSlug": product_slug,
        "productName": args.product_name,
        "resourceId": resource_id,
        "resourceName": args.resource_name,
        "sourcePageUrl": args.source_url,
        "rule": args.rule,
        "copyrightNote": args.copyright_note,
        "assetCount": len(assets),
        "assets": assets,
        "updatedAt": now
    }

    (data_resource_dir / "manifest.json").write_text(
        json.dumps(resource_manifest, ensure_ascii=False, indent=2), "utf-8"
    )

    product_path = data_product_dir / "product.json"
    if product_path.exists():
        product = json.loads(product_path.read_text("utf-8"))
    else:
        product = {"productSlug": product_slug, "productName": args.product_name, "resources": []}

    product["productName"] = args.product_name
    resources = [r for r in product.get("resources", []) if r.get("resourceId") != resource_id]
    resources.append({
        "resourceId": resource_id,
        "resourceName": args.resource_name,
        "sourcePageUrl": args.source_url,
        "rule": args.rule,
        "assetCount": len(assets),
        "updatedAt": now
    })
    product["resources"] = sorted(resources, key=lambda x: x["resourceId"])
    product["updatedAt"] = now

    product_path.write_text(json.dumps(product, ensure_ascii=False, indent=2), "utf-8")

    print(json.dumps({"product": product, "resource": resource_manifest}, ensure_ascii=False))

if __name__ == "__main__":
    main()
