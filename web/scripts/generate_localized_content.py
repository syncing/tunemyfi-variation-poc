import argparse
import json
import re
import urllib.request
from pathlib import Path
from typing import Any

from tunemyfi_language_packs import get_language_pack, normalize_lang

SHORTS_TARGET_SECONDS = 75
LONG_TARGET_SECONDS = 330

# Approximate minimum script lengths. These are intentionally generous because
# TTS speed varies by language and voice.
SCRIPT_LENGTH_GUIDE = {
    "ko": {"shorts_min_chars": 520, "long_min_chars": 2200},
    "ja": {"shorts_min_chars": 520, "long_min_chars": 2200},
    "zh": {"shorts_min_chars": 520, "long_min_chars": 2200},
    "en": {"shorts_min_words": 155, "long_min_words": 760},
    "de": {"shorts_min_words": 145, "long_min_words": 720},
    "fr": {"shorts_min_words": 150, "long_min_words": 740},
    "es": {"shorts_min_words": 155, "long_min_words": 760},
    "pt": {"shorts_min_words": 155, "long_min_words": 760},
}



OLLAMA_URL = "http://localhost:11434/api/generate"


def call_ollama(model: str, prompt: str) -> str:
    payload = json.dumps({
        "model": model,
        "prompt": prompt,
        "stream": False,
        "keep_alive": "10m",
        "options": {"temperature": 0.35, "num_ctx": 8192},
    }).encode("utf-8")

    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=900) as resp:
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
        return json.loads(text[start:end + 1])

    raise ValueError("Could not parse JSON from model response")


def looks_bad_spoken(value: Any) -> bool:
    s = str(value or "").strip()
    compact = s.replace(".", "").replace(",", "").replace(":", "").replace(" ", "")
    return not s or len(s) < 50 or compact.isdigit()




def load_pronunciation_map(root: Path, lang: str) -> dict[str, str]:
    if lang != "ko":
        return {}

    path = root / "scripts" / "config" / "tts_pronunciation_ko.json"
    if not path.exists():
        return {}

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}

    if isinstance(data, dict):
        return {str(k): str(v) for k, v in data.items() if str(k).strip() and str(v).strip()}

    return {}


def apply_pronunciation(text: str, pronunciation_map: dict[str, str]) -> str:
    value = str(text or "")

    for source, spoken in sorted(
        pronunciation_map.items(),
        key=lambda item: len(item[0]),
        reverse=True,
    ):
        value = value.replace(source, spoken)

    return value


def build_prompt(lang: str, product_name: str, source_long: str, source_shorts: str, verdict_text: str) -> str:
    pack = get_language_pack(lang)

    return f"""
You are creating localized YouTube product review content for TuneMyFi.

Target language:
{pack["name"]}

Product:
{product_name}

Reference longform narration, if available:
{source_long}

Reference Shorts script, only for style reference. Do not copy if it is weak:
{source_shorts}

Review evidence / verdict data:
{verdict_text[:12000]}

Create natural {pack["name"]} content.

Core generation strategy:
- First create a strong 5-minute longformNarration.
- Then create shortsScript by compressing the longformNarration.
- Do NOT create shortsScript independently from scratch.
- shortsScript must preserve the same product facts, pros, cons, and final verdict as longformNarration.
- shortsOverlayPlan must be derived from longformOverlayPlan.
- The Shorts text cards and Shorts summary must be short versions of the longform text cards and longform summary.
- Do not invent new claims for Shorts that are not present in the longform review.

Length requirements:
- longformNarration: normal YouTube review video, about 5 minutes to 5 minutes 30 seconds.
- shortsScript: YouTube Shorts style video, at least 60 seconds and preferably 70 to 80 seconds.
- Korean/Japanese/Chinese:
  - longformNarration must be at least 2200 characters.
  - shortsScript must be at least 520 characters.
- English/German/French/Spanish/Portuguese:
  - longformNarration must be at least 740 words.
  - shortsScript must be at least 150 words.

Longform structure:
- opening hook
- product positioning
- sound quality
- EQ/customization
- comfort/build
- battery/connectivity
- limitations
- who should buy it
- final verdict

Style requirements:
- Everything must be in {pack["name"]}.
- Tone: modern YouTube product review, buyer-focused, generally positive.
- Do not hide weaknesses, but keep caveats brief and practical.
- No community score, star rating, numeric verdict score, or community rating.
- Avoid meta commentary like "this is a summary", "things to check before buying", or "user opinions are summarized".
- On-screen card text must be product-specific, not meta descriptions.
- Overlay card titles and summary labels must be in {pack["name"]}.
- Use concise native phrasing for card text.
- For Korean card text, use short '-음/-슴' style where natural.

Spoken fields:
- longformSpoken must contain the same meaning as longformNarration, optimized for TTS pronunciation.
- shortsSpoken must contain the same meaning as shortsScript, optimized for TTS pronunciation.
- Do not put numbers-only or placeholder content in spoken fields.

Return this exact JSON. JSON only. No markdown:
{{
  "language": "{lang}",
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
    parser.add_argument("--lang", required=True)
    parser.add_argument("--product-name", required=True)
    parser.add_argument("--product-slug", required=True)
    parser.add_argument("--query-slug", default="")
    parser.add_argument("--model", default="qwen3:32b")
    parser.add_argument("--state-file", default="data/workflow-state/current.json")
    args = parser.parse_args()

    lang = normalize_lang(args.lang)

    web_root = Path.cwd()
    state_path = web_root / args.state_file
    state = json.loads(state_path.read_text()) if state_path.exists() else {}

    source_long = (
        state.get("enNarrationScript")
        or state.get("narrationScript")
        or ""
    )

    source_shorts = (
        state.get("enShortsScript")
        or state.get("shortsScript")
        or source_long[:1200]
    )

    if not str(source_long).strip():
        raise SystemExit("source narration is empty")

    verdict_text = ""
    verdict_file = state.get("verdictFile")
    if verdict_file:
        verdict_path = web_root / str(verdict_file)
        if verdict_path.exists():
            verdict_text = verdict_path.read_text()[:20000]

    prompt = build_prompt(
        lang=lang,
        product_name=args.product_name,
        source_long=str(source_long),
        source_shorts=str(source_shorts),
        verdict_text=verdict_text,
    )

    raw = call_ollama(args.model, prompt)
    data = extract_json(raw)

    out_dir = web_root / "data" / "video-work" / args.product_slug / f"{args.product_slug}-qwen-dubbed-{lang}"
    out_dir.mkdir(parents=True, exist_ok=True)

    longform = str(data.get("longformNarration", "")).strip()
    long_spoken = str(data.get("longformSpoken", "")).strip()
    shorts = str(data.get("shortsScript", "")).strip()
    shorts_spoken = str(data.get("shortsSpoken", "")).strip()

    if looks_bad_spoken(long_spoken):
        long_spoken = longform

    if looks_bad_spoken(shorts_spoken):
        shorts_spoken = shorts

    pronunciation_map = load_pronunciation_map(web_root, lang)
    if pronunciation_map:
        long_spoken = apply_pronunciation(long_spoken or longform, pronunciation_map)
        shorts_spoken = apply_pronunciation(shorts_spoken or shorts, pronunciation_map)

    files = {
        "narrationPath": out_dir / f"narration_{lang}.txt",
        "spokenNarrationPath": out_dir / f"narration_spoken_{lang}.txt",
        "overlayPlanPath": out_dir / f"overlay_plan_{lang}.json",
        "shortsNarrationPath": out_dir / f"shorts_narration_{lang}.txt",
        "shortsSpokenNarrationPath": out_dir / f"shorts_narration_spoken_{lang}.txt",
        "shortsOverlayPlanPath": out_dir / f"shorts_overlay_plan_{lang}.json",
        "youtubeMetadataPath": out_dir / f"youtube_metadata_{lang}.json",
    }

    files["narrationPath"].write_text(longform)
    files["spokenNarrationPath"].write_text(long_spoken)
    files["overlayPlanPath"].write_text(json.dumps(data.get("longformOverlayPlan") or {}, ensure_ascii=False, indent=2))
    files["shortsNarrationPath"].write_text(shorts)
    files["shortsSpokenNarrationPath"].write_text(shorts_spoken)
    files["shortsOverlayPlanPath"].write_text(json.dumps(data.get("shortsOverlayPlan") or {}, ensure_ascii=False, indent=2))
    files["youtubeMetadataPath"].write_text(json.dumps(data.get("youtube") or {}, ensure_ascii=False, indent=2))

    localized = state.setdefault("localizedContent", {})
    item = localized.setdefault(lang, {})

    item.update({
        "language": lang,
        "narrationScript": longform,
        "spokenScript": long_spoken,
        "shortsScript": shorts,
        "shortsSpokenScript": shorts_spoken,
        "youtubeMetadata": data.get("youtube") or {},
    })

    for key, value in files.items():
        item[key] = str(value.resolve())

    state["contentLanguages"] = sorted(set([*state.get("contentLanguages", []), "ko", "en", lang]))

    steps = state.setdefault("steps", {})
    steps[f"{lang}Content"] = "ready"
    steps[f"{lang}Video"] = steps.get(f"{lang}Video", "pending")
    steps[f"{lang}ShortsVideo"] = steps.get(f"{lang}ShortsVideo", "pending")

    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2))

    print(json.dumps({
        "ok": True,
        "lang": lang,
        "outDir": str(out_dir),
        "files": {k: str(v) for k, v in files.items()},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
