import argparse
import json
import re
import urllib.request
from pathlib import Path
from typing import Any

OLLAMA_URL = "http://localhost:11434/api/generate"


def call_ollama(model: str, prompt: str) -> str:
    payload = json.dumps(
        {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "keep_alive": "10m",
            "options": {
                "temperature": 0.35,
                "num_ctx": 8192,
            },
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=600) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    return str(data.get("response", "")).strip()


def extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    text = re.sub(r"^```json\s*", "", text)
    text = re.sub(r"^```\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    try:
        return json.loads(text)
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return json.loads(text[start : end + 1])

    raise ValueError("Could not parse JSON from model response")


def normalize_lines(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def build_prompt(
    product_name: str,
    korean_narration: str,
    korean_shorts: str,
    verdict_text: str,
) -> str:
    return f"""
You are creating English-language YouTube product review content for TuneMyFi.

Product:
{product_name}

Source Korean longform narration:
{korean_narration}

Source Korean Shorts script:
{korean_shorts}

Review evidence / verdict data:
{verdict_text[:12000]}

Create English content for both longform and Shorts.

Requirements:
- Output JSON only. No markdown. No code fences.
- Longform should be natural English, suitable for voice narration.
- Longform target: about 4 to 5 minutes.
- Shorts target: under 60 seconds, ideally 45 to 55 seconds.
- Tone: generally positive, highlighting strengths clearly.
- Do not hide weaknesses, but present them as brief buyer-check points.
- Avoid community score, rating, star rating, numeric verdict score, or "community rating".
- Make the content sound like a modern YouTube product review, not a literal translation.
- Keep product names and model names natural in English.
- On-screen card text should be concise, punchy, and YouTube-like.
- Summary card should have pros, cons, and oneLine.
- Do not mention that this was translated from Korean.

Return this exact JSON structure:
{{
  "language": "en",
  "longformNarration": "...",
  "longformSpoken": "...",
  "longformOverlayPlan": {{
    "sceneCaptions": [
      {{
        "title": "...",
        "lines": ["...", "..."],
        "durationWeight": 3
      }}
    ],
    "summary": {{
      "pros": ["...", "..."],
      "cons": ["...", "..."],
      "oneLine": "..."
    }}
  }},
  "shortsScript": "...",
  "shortsSpoken": "...",
  "shortsOverlayPlan": {{
    "sceneCaptions": [
      {{
        "title": "...",
        "lines": ["...", "..."],
        "durationWeight": 3
      }}
    ],
    "summary": {{
      "pros": ["...", "..."],
      "cons": ["...", "..."],
      "oneLine": "..."
    }}
  }},
  "youtube": {{
    "title": "...",
    "shortsTitle": "...",
    "description": "...",
    "hashtags": ["#TuneMyFi", "..."]
  }}
}}
""".strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--product-name", required=True)
    parser.add_argument("--product-slug", required=True)
    parser.add_argument("--query-slug", required=True)
    parser.add_argument("--model", default="qwen3:32b")
    parser.add_argument("--work-dir", default="")
    parser.add_argument("--state-file", default="data/workflow-state/current.json")
    args = parser.parse_args()

    web_root = Path.cwd()
    state_path = web_root / args.state_file
    state = json.loads(state_path.read_text()) if state_path.exists() else {}

    product_name = args.product_name or state.get("productName") or args.product_slug
    query_slug = args.query_slug or state.get("querySlug") or args.product_slug

    korean_narration = str(state.get("narrationScript", "")).strip()
    korean_shorts = str(state.get("shortsScript", "")).strip()

    if not korean_narration:
        raise SystemExit("narrationScript is empty. Prepare Korean narration first.")

    if not korean_shorts:
        korean_shorts = korean_narration[:1200]

    verdict_text = ""
    verdict_file = state.get("verdictFile") or f"data/verdicts/{query_slug}.verdict.json"
    verdict_path = web_root / str(verdict_file)
    if verdict_path.exists():
        verdict_text = verdict_path.read_text()[:20000]

    prompt = build_prompt(
        product_name=product_name,
        korean_narration=korean_narration,
        korean_shorts=korean_shorts,
        verdict_text=verdict_text,
    )

    raw = call_ollama(args.model, prompt)
    data = extract_json(raw)

    out_dir = Path(args.work_dir) if args.work_dir else (
        web_root
        / "data"
        / "video-work"
        / args.product_slug
        / f"{args.product_slug}-qwen-dubbed-en"
    )
    out_dir.mkdir(parents=True, exist_ok=True)

    longform_narration = str(data.get("longformNarration", "")).strip()
    longform_spoken = str(data.get("longformSpoken", "")).strip() or longform_narration
    shorts_script = str(data.get("shortsScript", "")).strip()
    shorts_spoken = str(data.get("shortsSpoken", "")).strip() or shorts_script

    long_overlay = data.get("longformOverlayPlan") or {}
    short_overlay = data.get("shortsOverlayPlan") or {}
    youtube = data.get("youtube") or {}

    files = {
        "enNarrationPath": out_dir / "narration_en.txt",
        "enSpokenNarrationPath": out_dir / "narration_spoken_en.txt",
        "enOverlayPlanPath": out_dir / "overlay_plan_en.json",
        "enShortsNarrationPath": out_dir / "shorts_narration_en.txt",
        "enShortsSpokenNarrationPath": out_dir / "shorts_narration_spoken_en.txt",
        "enShortsOverlayPlanPath": out_dir / "shorts_overlay_plan_en.json",
        "enYoutubeMetadataPath": out_dir / "youtube_metadata_en.json",
    }

    files["enNarrationPath"].write_text(longform_narration)
    files["enSpokenNarrationPath"].write_text(longform_spoken)
    files["enOverlayPlanPath"].write_text(json.dumps(long_overlay, ensure_ascii=False, indent=2))
    files["enShortsNarrationPath"].write_text(shorts_script)
    files["enShortsSpokenNarrationPath"].write_text(shorts_spoken)
    files["enShortsOverlayPlanPath"].write_text(json.dumps(short_overlay, ensure_ascii=False, indent=2))
    files["enYoutubeMetadataPath"].write_text(json.dumps(youtube, ensure_ascii=False, indent=2))

    state.update(
        {
            "contentLanguages": ["ko", "en"],
            "reviewLanguages": ["ko", "en"],
            "enNarrationScript": longform_narration,
            "enSpokenScript": longform_spoken,
            "enNarrationPath": str(files["enNarrationPath"]),
            "enSpokenNarrationPath": str(files["enSpokenNarrationPath"]),
            "enOverlayPlanPath": str(files["enOverlayPlanPath"]),
            "enShortsScript": shorts_script,
            "enShortsSpokenScript": shorts_spoken,
            "enShortsNarrationPath": str(files["enShortsNarrationPath"]),
            "enShortsSpokenNarrationPath": str(files["enShortsSpokenNarrationPath"]),
            "enShortsOverlayPlanPath": str(files["enShortsOverlayPlanPath"]),
            "enYoutubeMetadata": youtube,
            "enYoutubeMetadataPath": str(files["enYoutubeMetadataPath"]),
        }
    )

    steps = state.setdefault("steps", {})
    steps["english"] = "ready"
    steps["englishVideo"] = steps.get("englishVideo", "pending")
    steps["englishShortsVideo"] = steps.get("englishShortsVideo", "pending")

    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2))

    result = {
        "ok": True,
        "language": "en",
        "outDir": str(out_dir),
        "files": {k: str(v) for k, v in files.items()},
        "youtube": youtube,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
