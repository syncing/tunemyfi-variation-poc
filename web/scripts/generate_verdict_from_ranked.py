import argparse
import json
import re
import urllib.request
from pathlib import Path

OLLAMA_URL = "http://localhost:11434/api/generate"


def slug_safe(text: str) -> str:
    text = re.sub(r"[^a-z0-9가-힣]+", "-", text.strip().lower())
    return re.sub(r"-+", "-", text).strip("-") or "item"


def call_ollama(model: str, prompt: str) -> str:
    payload = json.dumps(
        {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.25,
                "num_ctx": 16384,
            },
        },
        ensure_ascii=False,
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


def extract_json(text: str) -> dict:
    text = text.strip()

    if text.startswith("```"):
        text = text.replace("```json", "").replace("```", "").strip()

    start = text.find("{")
    end = text.rfind("}")

    if start >= 0 and end >= 0:
        text = text[start : end + 1]

    return json.loads(text)


def compact_ranked(data: dict, max_items: int) -> list[dict]:
    rows = []

    for item in data.get("ranked", [])[:max_items]:
        j = item.get("judgement", {})

        rows.append(
            {
                "title": item.get("title"),
                "channelTitle": item.get("channelTitle"),
                "url": item.get("url"),
                "viewCount": item.get("viewCount"),
                "likeCount": item.get("likeCount"),
                "commentCount": item.get("commentCount"),
                "recommendation_score": j.get("recommendation_score"),
                "audio_quality_score": j.get("audio_quality_score"),
                "performance_score": j.get("performance_score"),
                "uniqueness_score": j.get("uniqueness_score"),
                "comment_signal_score": j.get("comment_signal_score"),
                "reason": j.get("reason"),
                "why_this_version": j.get("why_this_version"),
                "compared_to_original": j.get("compared_to_original"),
                "best_for": j.get("best_for"),
                "listener_match": j.get("listener_match"),
                "positive_signals": j.get("positive_signals"),
                "negative_signals": j.get("negative_signals"),
                "best_use_case": j.get("best_use_case"),
            }
        )

    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ranked-file", required=True)
    ap.add_argument("--output-slug", default="")
    ap.add_argument("--model", default="qwen3:32b")
    ap.add_argument("--max-items", type=int, default=10)
    args = ap.parse_args()

    ranked_path = Path(args.ranked_file)
    data = json.loads(ranked_path.read_text("utf-8"))

    query = data.get("query", ranked_path.stem)
    output_slug = slug_safe(args.output_slug or query)

    compact = compact_ranked(data, args.max_items)

    prompt = f"""
당신은 TuneMyFi의 커뮤니티 인텔리전스 분석 엔진입니다.

아래는 유튜브 검색 결과 후보들을 각각 Qwen이 분석해서 랭킹한 결과입니다.
각 후보의 reason, positive_signals, negative_signals, best_use_case, score를 종합해서
전체 검색 주제에 대한 Final Verdict JSON을 생성하세요.

검색 주제:
{query}

반드시 아래 JSON 스키마만 출력하세요. 마크다운 금지. 설명 금지.

{{
  "query": "...",
  "communityScore": 0,
  "summary": "...",
  "recommendedFor": ["..."],
  "notRecommendedFor": ["..."],
  "topPicks": [
    {{
      "title": "...",
      "url": "...",
      "why": "..."
    }}
  ],
  "repeatedPros": ["..."],
  "repeatedCons": ["..."],
  "upgradeAdvice": "...",
  "newBuyerAdvice": "...",
  "contentAngles": ["..."],
  "narrationBrief": "2분 리뷰 영상 나레이션에 꼭 들어가야 할 핵심 요약"
}}

분석 대상:
{json.dumps(compact, ensure_ascii=False, indent=2)}
""".strip()

    raw = call_ollama(args.model, prompt)

    verdict = extract_json(raw)

    out_dir = Path.cwd() / "data" / "verdicts"
    out_dir.mkdir(parents=True, exist_ok=True)

    out_path = out_dir / f"{output_slug}.verdict.json"
    out_path.write_text(json.dumps(verdict, ensure_ascii=False, indent=2), "utf-8")

    print(json.dumps({
        "ok": True,
        "query": query,
        "output": str(out_path),
        "verdict": verdict,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
