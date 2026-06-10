import argparse
import asyncio
import json
import subprocess
import urllib.request
from pathlib import Path

import edge_tts

OLLAMA_URL = "http://localhost:11434/api/generate"


def resolve_web_root() -> Path:
    cwd = Path.cwd()
    if (cwd / "web" / "data").exists():
        return cwd / "web"
    return cwd


def call_ollama(model: str, prompt: str) -> str:
    payload = json.dumps(
        {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.35, "num_ctx": 8192},
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=600) as res:
        data = json.loads(res.read().decode("utf-8"))
        return data.get("response", "").strip()


async def make_tts(text: str, out_path: Path):
    communicate = edge_tts.Communicate(
        text=text,
        voice="ko-KR-SunHiNeural",
        rate="+0%",
        volume="+0%",
    )
    await communicate.save(str(out_path))


def ffprobe_duration(path: Path) -> float:
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ]
    )
    return float(out.decode("utf-8").strip())


def parse_resource_ids(value: str) -> list[str]:
    return [x.strip() for x in value.split(",") if x.strip()]


def load_assets(root: Path, product_slug: str, resource_ids: list[str]) -> list[dict]:
    all_assets = []

    for resource_id in resource_ids:
        manifest_path = (
            root
            / "data"
            / "product-assets"
            / product_slug
            / "resources"
            / resource_id
            / "manifest.json"
        )

        if not manifest_path.exists():
            raise FileNotFoundError(f"manifest not found: {manifest_path}")

        manifest = json.loads(manifest_path.read_text("utf-8"))

        for asset in manifest.get("assets", []):
            copied = dict(asset)
            copied["_resourceId"] = resource_id
            copied["_resourceName"] = manifest.get("resourceName", resource_id)
            all_assets.append(copied)

    return all_assets


def load_selected_public_paths(root: Path, product_slug: str) -> list[str]:
    selected_path = (
        root
        / "data"
        / "product-assets"
        / product_slug
        / "selected-assets.json"
    )

    if not selected_path.exists():
        return []

    data = json.loads(selected_path.read_text("utf-8"))
    return data.get("selectedPublicPaths", [])


def pick_assets(root: Path, product_slug: str, resource_ids: list[str], limit: int) -> list[dict]:
    all_assets = load_assets(root, product_slug, resource_ids)
    selected_paths = load_selected_public_paths(root, product_slug)

    if selected_paths:
        by_path = {asset["publicPath"]: asset for asset in all_assets}
        picked = [by_path[p] for p in selected_paths if p in by_path]
        return picked[:limit]

    assets_by_resource: dict[str, list[dict]] = {rid: [] for rid in resource_ids}

    for asset in all_assets:
        assets_by_resource.setdefault(asset["_resourceId"], []).append(asset)

    picked = []

    while len(picked) < limit:
        added = False

        for resource_id in resource_ids:
            bucket = assets_by_resource.get(resource_id, [])

            if bucket:
                picked.append(bucket.pop(0))
                added = True

                if len(picked) >= limit:
                    break

        if not added:
            break

    return picked


def read_verdict_text(path_text: str) -> str:
    if not path_text:
        return ""

    path = Path(path_text)

    if not path.exists():
        raise FileNotFoundError(f"verdict file not found: {path}")

    raw = path.read_text("utf-8")

    try:
        parsed = json.loads(raw)
        return json.dumps(parsed, ensure_ascii=False, indent=2)
    except Exception:
        return raw


def load_pronunciation_map(root: Path) -> dict:
    path = root / "scripts" / "config" / "tts_pronunciation_ko.json"

    if not path.exists():
        return {}

    return json.loads(path.read_text("utf-8"))


def apply_pronunciation(text: str, pronunciation_map: dict) -> str:
    for source, spoken in sorted(
        pronunciation_map.items(),
        key=lambda item: len(item[0]),
        reverse=True,
    ):
        text = text.replace(source, spoken)

    return text


def pronunciation_guide_text(pronunciation_map: dict) -> str:
    if not pronunciation_map:
        return ""

    lines = [
        f"- {source} → {spoken}"
        for source, spoken in sorted(
            pronunciation_map.items(),
            key=lambda item: len(item[0]),
            reverse=True,
        )
    ]

    return "\n".join(lines)


def build_prompt(
    product_name: str,
    target_seconds: int,
    verdict_text: str,
    resource_ids: list[str],
    asset_count: int,
    pronunciation_map: dict,
) -> str:
    if not verdict_text.strip():
        verdict_text = """
현재는 테스트 단계입니다.
수집된 제품 이미지와 기본 제품 정보를 바탕으로, 커뮤니티 리뷰 종합 영상처럼 들리는
약 2분 내외의 한국어 리뷰 나레이션을 작성해 주세요.
"""

    guide = pronunciation_guide_text(pronunciation_map)

    guide_block = ""
    if guide:
        guide_block = f"""

발음 가이드:
아래 표기는 나레이션 본문에서도 가능하면 한국어 발음 표기로 사용하세요.

{guide}
"""

    return f"""
당신은 한국어 IT/오디오 리뷰 유튜브 채널의 나레이션 작가입니다.

제품명:
{product_name}

사용 이미지 리소스:
{", ".join(resource_ids)}

사용 이미지 수:
{asset_count}

아래 리뷰 종합 내용을 바탕으로 약 {target_seconds}초 분량의 한국어 나레이션 스크립트를 작성하세요.

조건:
- 자연스러운 존댓말
- 실제 사람이 말하는 유튜브 리뷰 톤
- 과장 광고처럼 쓰지 말 것
- 장점과 단점을 균형 있게 다룰 것
- 기존 모델 사용자와 신규 구매자 조언을 구분할 것
- 마크다운, 제목, 번호, 괄호 설명 없이 나레이션 본문만 출력할 것
- 너무 짧게 쓰지 말고 실제 {target_seconds}초 정도 말할 수 있는 분량으로 작성할 것
- 제품 이미지만 보고 단정하지 말고, 반드시 리뷰 종합 내용에 근거한 표현을 사용할 것

리뷰 종합 내용:
{verdict_text}
{guide_block}
""".strip()


def render_scene(
    image_path: Path,
    clip_path: Path,
    seconds: float,
    width: int = 1920,
    height: int = 1080,
    fps: int = 30,
):
    frames = int(seconds * fps)

    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,"
        f"zoompan=z='min(zoom+0.0007,1.12)':"
        f"d={frames}:s={width}x{height}:fps={fps},"
        f"format=yuv420p"
    )

    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loop",
            "1",
            "-i",
            str(image_path),
            "-vf",
            vf,
            "-t",
            str(seconds),
            "-r",
            str(fps),
            "-an",
            str(clip_path),
        ],
        check=True,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--product-slug", required=True)
    ap.add_argument("--resource-ids", required=True)
    ap.add_argument("--product-name", required=True)
    ap.add_argument("--model", default="qwen3:32b")
    ap.add_argument("--limit", type=int, default=16)
    ap.add_argument("--target-seconds", type=int, default=120)
    ap.add_argument("--verdict-file", default="")
    args = ap.parse_args()

    root = resolve_web_root()
    resource_ids = parse_resource_ids(args.resource_ids)

    if not resource_ids:
        raise RuntimeError("resource-ids가 비어 있습니다.")

    pronunciation_map = load_pronunciation_map(root)

    assets = pick_assets(
        root=root,
        product_slug=args.product_slug,
        resource_ids=resource_ids,
        limit=args.limit,
    )

    if not assets:
        raise RuntimeError("assets가 없습니다.")

    resource_key = "-".join(resource_ids)

    out_dir = root / "public" / "videos" / args.product_slug
    work_dir = (
        root
        / "data"
        / "video-work"
        / args.product_slug
        / f"{resource_key}-qwen-dubbed-ko"
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    verdict_text = read_verdict_text(args.verdict_file)

    prompt = build_prompt(
        product_name=args.product_name,
        target_seconds=args.target_seconds,
        verdict_text=verdict_text,
        resource_ids=resource_ids,
        asset_count=len(assets),
        pronunciation_map=pronunciation_map,
    )

    prompt_path = work_dir / "prompt.txt"
    prompt_path.write_text(prompt, "utf-8")

    narration = call_ollama(args.model, prompt)
    narration = apply_pronunciation(narration, pronunciation_map)

    narration_path = work_dir / "narration_ko.txt"
    narration_path.write_text(narration, "utf-8")

    audio_path = work_dir / "narration_ko.mp3"
    asyncio.run(make_tts(narration, audio_path))

    audio_seconds = ffprobe_duration(audio_path)
    seconds_per_image = max(4.0, audio_seconds / len(assets))

    clips = []

    for i, asset in enumerate(assets, 1):
        image_path = root / "public" / asset["publicPath"].lstrip("/")
        clip_path = work_dir / f"scene_{i:02d}.mp4"

        if not image_path.exists():
            raise FileNotFoundError(f"image not found: {image_path}")

        render_scene(
            image_path=image_path,
            clip_path=clip_path,
            seconds=seconds_per_image,
        )

        clips.append(clip_path)

    clips_txt = work_dir / "clips.txt"
    clips_txt.write_text(
        "".join(f"file '{p.resolve()}'\n" for p in clips),
        "utf-8",
    )

    silent_path = work_dir / "silent.mp4"

    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(clips_txt),
            "-c",
            "copy",
            str(silent_path),
        ],
        check=True,
    )

    final_name = f"{resource_key}-qwen-dubbed-ko.mp4"
    final_path = out_dir / final_name

    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(silent_path),
            "-i",
            str(audio_path),
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            str(final_path),
        ],
        check=True,
    )

    result = {
        "ok": True,
        "productSlug": args.product_slug,
        "resourceIds": resource_ids,
        "filename": final_name,
        "publicPath": f"/videos/{args.product_slug}/{final_name}",
        "promptPath": str(prompt_path),
        "narrationPath": str(narration_path),
        "audioPath": str(audio_path),
        "durationSeconds": audio_seconds,
        "assetCount": len(assets),
        "selectedAssetsUsed": bool(load_selected_public_paths(root, args.product_slug)),
        "narrationPreview": narration[:300],
    }

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
