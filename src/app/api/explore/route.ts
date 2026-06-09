import { NextRequest, NextResponse } from "next/server";

type YoutubeCandidate = {
  videoId: string;
  url: string;
  title: string;
  channelTitle: string;
  description: string;
  publishedAt: string;
  duration: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  comments: string[];
};

type Judgement = {
  valid_variation: boolean;
  variation_type: string;
  audio_quality_score: number;
  performance_score: number;
  uniqueness_score: number;
  audiophile_interest_score: number;
  comment_signal_score: number;
  recommendation_score: number;
  reason: string;
  why_this_version?: string;
  compared_to_original?: string;
  best_for?: string[];
  positive_signals?: string[];
  negative_signals?: string[];
  best_use_case?: string;
};

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:32b";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const COMMENTS_URL = "https://www.googleapis.com/youtube/v3/commentThreads";

const SYSTEM_PROMPT = `
You are TuneMyFi Variation Judge.

Your job is to evaluate whether a YouTube video is a meaningful music variation for an audiophile music exploration service.

The user searches for a song they already like.
TuneMyFi should help the user discover better, different, cleaner, more emotional, or otherwise interesting versions of the same song.

Use only:
- search query
- video title
- channel title
- description
- view count
- like count
- comment count
- user comments

Classify the video into exactly one variation_type:
official_studio, official_live, live_performance, cover, acoustic, remaster, rehearsal_or_demo, fan_cam, lyrics_video, reaction, unrelated, low_quality_duplicate, unknown.

valid_variation:
true if the video is useful as a version of the searched song.
false if it is reaction, unrelated, pure lyrics video, commentary, short clip, clickbait, or unclear.

Scoring:
audio_quality_score: 0 to 10.
performance_score: 0 to 10.
uniqueness_score: 0 to 10.
audiophile_interest_score: 0 to 10.
comment_signal_score: 0 to 10.
recommendation_score: 0 to 10.

Important:
- Do not reward only popularity.
- Comments about appearance, fandom, humor, or nostalgia are weak signals.
- Comments about sound quality, vocal expression, live emotion, arrangement, instrument tone, or "this version is better" are strong signals.
- Reason must cite concrete evidence from comments, title, description, or channel.
- Do not invent gear matching such as HD650 or tube amp unless explicitly present.
- Do not include listener_match.
- If invalid, recommendation_score must be 0 and positive_signals must be [].

Return JSON only.

Schema:
{
  "valid_variation": true,
  "variation_type": "live_performance",
  "audio_quality_score": 0,
  "performance_score": 0,
  "uniqueness_score": 0,
  "audiophile_interest_score": 0,
  "comment_signal_score": 0,
  "recommendation_score": 0,
  "reason": "구체적인 한국어 설명",
  "why_this_version": "이 버전만의 매력",
  "compared_to_original": "원곡 대비 차이 또는 알 수 없음",
  "best_for": ["감정 전달", "보컬 중심 청취"],
  "positive_signals": ["댓글/제목/설명에서 확인되는 구체 신호"],
  "negative_signals": ["주의할 점"],
  "best_use_case": "이 버전을 언제/왜 들으면 좋은지"
}
`;

async function youtubeGet(url: string, params: Record<string, string>) {
  if (!YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY가 없습니다.");
  }

  const searchParams = new URLSearchParams({
    ...params,
    key: YOUTUBE_API_KEY,
  });

  const res = await fetch(`${url}?${searchParams.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API error ${res.status}: ${body}`);
  }

  return res.json();
}

async function searchVideos(query: string, maxResults = 10) {
  const data = await youtubeGet(SEARCH_URL, {
    part: "snippet",
    q: query,
    type: "video",
    maxResults: String(maxResults),
    order: "relevance",
    safeSearch: "none",
    regionCode: "KR",
    relevanceLanguage: "ko",
  });

  return (data.items ?? []).map((item: any) => ({
    videoId: item.id.videoId,
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    title: item.snippet?.title ?? "",
    channelTitle: item.snippet?.channelTitle ?? "",
    description: item.snippet?.description ?? "",
    publishedAt: item.snippet?.publishedAt ?? "",
  }));
}

async function fetchVideoStats(videoIds: string[]) {
  if (videoIds.length === 0) return {};

  const data = await youtubeGet(VIDEOS_URL, {
    part: "snippet,statistics,contentDetails",
    id: videoIds.join(","),
    maxResults: "50",
  });

  const map: Record<string, any> = {};

  for (const item of data.items ?? []) {
    map[item.id] = {
      title: item.snippet?.title ?? "",
      channelTitle: item.snippet?.channelTitle ?? "",
      description: item.snippet?.description ?? "",
      publishedAt: item.snippet?.publishedAt ?? "",
      duration: item.contentDetails?.duration ?? "",
      viewCount: Number(item.statistics?.viewCount ?? 0),
      likeCount: Number(item.statistics?.likeCount ?? 0),
      commentCount: Number(item.statistics?.commentCount ?? 0),
    };
  }

  return map;
}

async function fetchTopComments(videoId: string, maxResults = 15) {
  try {
    const data = await youtubeGet(COMMENTS_URL, {
      part: "snippet",
      videoId,
      maxResults: String(maxResults),
      order: "relevance",
      textFormat: "plainText",
    });

    return (data.items ?? [])
      .map(
        (item: any) =>
          item.snippet?.topLevelComment?.snippet?.textDisplay?.trim() ?? "",
      )
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function collectCandidates(query: string): Promise<YoutubeCandidate[]> {
  const candidates = await searchVideos(query, 10);
  const videoIds = candidates.map((item: any) => item.videoId);
  const statsMap = await fetchVideoStats(videoIds);

  const enriched: YoutubeCandidate[] = [];

  for (const item of candidates) {
    const stats = statsMap[item.videoId] ?? {};
    const comments = await fetchTopComments(item.videoId, 15);

    enriched.push({
      videoId: item.videoId,
      url: item.url,
      title: stats.title || item.title,
      channelTitle: stats.channelTitle || item.channelTitle,
      description: stats.description || item.description,
      publishedAt: stats.publishedAt || item.publishedAt,
      duration: stats.duration ?? "",
      viewCount: stats.viewCount ?? 0,
      likeCount: stats.likeCount ?? 0,
      commentCount: stats.commentCount ?? 0,
      comments,
    });
  }

  return enriched;
}

async function judgeCandidate(query: string, candidate: YoutubeCandidate) {
  const userPayload = {
    query,
    video: {
      title: candidate.title,
      channelTitle: candidate.channelTitle,
      description: candidate.description,
      publishedAt: candidate.publishedAt,
      duration: candidate.duration,
      viewCount: candidate.viewCount,
      likeCount: candidate.likeCount,
      commentCount: candidate.commentCount,
      comments: candidate.comments,
    },
  };

  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt:
        SYSTEM_PROMPT +
        "\n\nEvaluate this YouTube candidate:\n\n" +
        JSON.stringify(userPayload, null, 2),
      stream: false,
      format: "json",
      options: {
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama error ${res.status}: ${body}`);
  }

  const data = await res.json();

  let parsed: Judgement;

  try {
    parsed = JSON.parse(data.response);
  } catch {
    parsed = {
      valid_variation: false,
      variation_type: "unknown",
      audio_quality_score: 0,
      performance_score: 0,
      uniqueness_score: 0,
      audiophile_interest_score: 0,
      comment_signal_score: 0,
      recommendation_score: 0,
      reason: "LLM JSON 파싱 실패",
      positive_signals: [],
      negative_signals: ["json_parse_error"],
      best_use_case: "TuneMyFi 추천 대상에서 제외",
    };
  }

  if (parsed.valid_variation === false) {
    parsed.positive_signals = [];
    parsed.recommendation_score = 0;
    parsed.best_use_case = "TuneMyFi 추천 대상에서 제외";
  }

  return parsed;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = String(body.query ?? "").trim();

    if (!query) {
      return NextResponse.json(
        { error: "검색어를 입력하세요." },
        { status: 400 },
      );
    }

    const candidates = await collectCandidates(query);

    const ranked = [];

    for (const candidate of candidates) {
      const judgement = await judgeCandidate(query, candidate);

      ranked.push({
        ...candidate,
        judgement,
      });
    }

    ranked.sort(
      (a, b) =>
        (b.judgement.recommendation_score ?? 0) -
        (a.judgement.recommendation_score ?? 0),
    );

    return NextResponse.json({
      query,
      count: ranked.length,
      ranked,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message ?? "unknown error",
      },
      { status: 500 },
    );
  }
}
