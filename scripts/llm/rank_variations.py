import argparse
import json
import os
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

PROMPT_PATH = ROOT / "prompts" / "variation_judge_v2.txt"
OUT_DIR = ROOT / "data" / "ranked"

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:32b")


def call_ollama(prompt: str) -> dict[str, Any]:
    response = requests.post(
        f"{OLLAMA_HOST}/api/generate",
        json={
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.1
            },
        },
        timeout=300,
    )
    response.raise_for_status()

    raw = response.json().get("response", "")

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {
            "valid_variation": False,
            "variation_type": "unknown",
            "audio_quality_score": 0,
            "performance_score": 0,
            "uniqueness_score": 0,
            "audiophile_interest_score": 0,
            "comment_signal_score": 0,
            "recommendation_score": 0,
            "reason": "LLM JSON 파싱 실패",
            "positive_signals": [],
            "negative_signals": ["json_parse_error"],
            "best_use_case": "TuneMyFi 추천 대상에서 제외",
            "raw_response": raw,
        }

    # invalid 후보 후처리 강제
    if parsed.get("valid_variation") is False:
        parsed["positive_signals"] = []
        parsed["recommendation_score"] = 0
        parsed["best_use_case"] = "TuneMyFi 추천 대상에서 제외"
        parsed["why_this_version"] = "추천 대상이 아닙니다."
        parsed["compared_to_original"] = "음악 variation이 아니므로 비교 대상이 아닙니다."
        parsed["best_for"] = []
        parsed["listener_match"] = []

    return parsed


def build_prompt(system_prompt: str, query: str, candidate: dict[str, Any]) -> str:
    sample = {
        "query": query,
        "video": {
            "title": candidate.get("title", ""),
            "channelTitle": candidate.get("channelTitle", ""),
            "description": candidate.get("description", ""),
            "publishedAt": candidate.get("publishedAt", ""),
            "duration": candidate.get("duration", ""),
            "viewCount": candidate.get("viewCount", 0),
            "likeCount": candidate.get("likeCount", 0),
            "commentCount": candidate.get("commentCount", 0),
            "comments": candidate.get("comments", [])[:20],
        },
    }

    return (
        system_prompt
        + "\n\nEvaluate this YouTube candidate for TuneMyFi.\n\n"
        + json.dumps(sample, ensure_ascii=False, indent=2)
    )


def rank_file(input_path: Path) -> dict[str, Any]:
    system_prompt = PROMPT_PATH.read_text(encoding="utf-8")
    source = json.loads(input_path.read_text(encoding="utf-8"))

    query = source["query"]
    candidates = source.get("candidates", [])

    ranked = []

    for index, candidate in enumerate(candidates, start=1):
        print(f"[{index}/{len(candidates)}] judging: {candidate.get('title')}")

        prompt = build_prompt(system_prompt, query, candidate)
        judgement = call_ollama(prompt)

        ranked.append(
            {
                "videoId": candidate.get("videoId"),
                "url": candidate.get("url"),
                "title": candidate.get("title"),
                "channelTitle": candidate.get("channelTitle"),
                "duration": candidate.get("duration"),
                "viewCount": candidate.get("viewCount"),
                "likeCount": candidate.get("likeCount"),
                "commentCount": candidate.get("commentCount"),
                "judgement": judgement,
            }
        )

    ranked_sorted = sorted(
        ranked,
        key=lambda item: item["judgement"].get("recommendation_score", 0),
        reverse=True,
    )

    return {
        "query": query,
        "sourceFile": str(input_path),
        "model": OLLAMA_MODEL,
        "candidateCount": len(candidates),
        "ranked": ranked_sorted,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_json", help="data/variations/*.json")
    args = parser.parse_args()

    input_path = Path(args.input_json).resolve()

    if not input_path.exists():
        raise FileNotFoundError(input_path)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    result = rank_file(input_path)

    out_path = OUT_DIR / f"{input_path.stem}.ranked.json"
    out_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print()
    print(f"saved: {out_path}")
    print()
    print("Top results:")

    for idx, item in enumerate(result["ranked"][:5], start=1):
        judgement = item["judgement"]
        print(
            f"{idx}. {judgement.get('recommendation_score')} "
            f"/ {judgement.get('variation_type')} "
            f"/ valid={judgement.get('valid_variation')} "
            f"/ {item['title']}"
        )
        print(f"   {judgement.get('reason')}")


if __name__ == "__main__":
    main()
