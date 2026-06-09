import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

OUT_DIR = ROOT / "data" / "variations"

YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY")

SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
COMMENTS_URL = "https://www.googleapis.com/youtube/v3/commentThreads"


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9가-힣]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-") or "query"


def require_api_key() -> str:
    if not YOUTUBE_API_KEY:
        raise RuntimeError(
            "YOUTUBE_API_KEY가 없습니다. 프로젝트 루트의 .env 파일을 확인하세요."
        )
    return YOUTUBE_API_KEY


def youtube_get(url: str, params: dict[str, Any]) -> dict[str, Any]:
    params = {
        **params,
        "key": require_api_key(),
    }

    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    return response.json()


def search_videos(query: str, max_results: int = 20) -> list[dict[str, Any]]:
    data = youtube_get(
        SEARCH_URL,
        {
            "part": "snippet",
            "q": query,
            "type": "video",
            "maxResults": max_results,
            "order": "relevance",
            "safeSearch": "none",
            "regionCode": "KR",
            "relevanceLanguage": "ko",
        },
    )

    results = []

    for item in data.get("items", []):
        video_id = item["id"]["videoId"]
        snippet = item.get("snippet", {})

        results.append(
            {
                "videoId": video_id,
                "title": snippet.get("title", ""),
                "channelTitle": snippet.get("channelTitle", ""),
                "description": snippet.get("description", ""),
                "publishedAt": snippet.get("publishedAt", ""),
                "url": f"https://www.youtube.com/watch?v={video_id}",
            }
        )

    return results


def fetch_video_stats(video_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not video_ids:
        return {}

    data = youtube_get(
        VIDEOS_URL,
        {
            "part": "snippet,statistics,contentDetails",
            "id": ",".join(video_ids),
            "maxResults": 50,
        },
    )

    stats = {}

    for item in data.get("items", []):
        video_id = item["id"]
        snippet = item.get("snippet", {})
        statistics = item.get("statistics", {})
        content_details = item.get("contentDetails", {})

        stats[video_id] = {
            "title": snippet.get("title", ""),
            "channelTitle": snippet.get("channelTitle", ""),
            "description": snippet.get("description", ""),
            "publishedAt": snippet.get("publishedAt", ""),
            "duration": content_details.get("duration", ""),
            "viewCount": int(statistics.get("viewCount", 0)),
            "likeCount": int(statistics.get("likeCount", 0)),
            "commentCount": int(statistics.get("commentCount", 0)),
        }

    return stats


def fetch_top_comments(video_id: str, max_results: int = 20) -> list[str]:
    try:
        data = youtube_get(
            COMMENTS_URL,
            {
                "part": "snippet",
                "videoId": video_id,
                "maxResults": max_results,
                "order": "relevance",
                "textFormat": "plainText",
            },
        )
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else "unknown"
        print(f"comments skipped: {video_id} status={status}")
        return []

    comments = []

    for item in data.get("items", []):
        snippet = item["snippet"]["topLevelComment"]["snippet"]
        text = snippet.get("textDisplay", "").strip()
        if text:
            comments.append(text)

    return comments


def collect(query: str, max_results: int = 20) -> dict[str, Any]:
    candidates = search_videos(query, max_results=max_results)
    video_ids = [item["videoId"] for item in candidates]
    stats_map = fetch_video_stats(video_ids)

    enriched = []

    for item in candidates:
        video_id = item["videoId"]
        stats = stats_map.get(video_id, {})
        comments = fetch_top_comments(video_id, max_results=20)

        enriched.append(
            {
                "videoId": video_id,
                "url": item["url"],
                "title": stats.get("title") or item["title"],
                "channelTitle": stats.get("channelTitle") or item["channelTitle"],
                "description": stats.get("description") or item["description"],
                "publishedAt": stats.get("publishedAt") or item["publishedAt"],
                "duration": stats.get("duration", ""),
                "viewCount": stats.get("viewCount", 0),
                "likeCount": stats.get("likeCount", 0),
                "commentCount": stats.get("commentCount", 0),
                "comments": comments,
            }
        )

    return {
        "query": query,
        "collectedAt": datetime.now().isoformat(),
        "candidateCount": len(enriched),
        "candidates": enriched,
    }


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("query", help="YouTube search query")
    parser.add_argument("--max-results", type=int, default=20)

    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    result = collect(args.query, max_results=args.max_results)

    out_path = OUT_DIR / f"{slugify(args.query)}.json"
    out_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"saved: {out_path}")
    print(f"candidates: {result['candidateCount']}")

    for idx, item in enumerate(result["candidates"][:5], start=1):
        print(
            f"{idx}. {item['title']} / "
            f"{item['channelTitle']} / "
            f"comments={len(item['comments'])}"
        )


if __name__ == "__main__":
    main()
