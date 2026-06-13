
function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "query"
  );
}

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { YoutubeTranscript } from "youtube-transcript";

export type YoutubeCandidate = {
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
  transcript: string;
  transcriptLanguage: string;
};

export type ProductJudgement = {
  valid_product_signal: boolean;
  content_type: string;

  review_relevance_score: number;
  real_user_signal_score: number;
  purchase_decision_value_score: number;

  complaint_signal_score: number;
  praise_signal_score: number;

  overall_recommendation_confidence: number;

  community_consensus: string;

  who_should_buy: string[];
  who_should_skip: string[];

  pros: string[];
  cons: string[];

  watch_points: string[];

  positive_signals: string[];
  negative_signals: string[];

  best_use_case: string;

  reviewer_claims: string[];
  community_reactions: string[];
  agreement_points: string[];
  disagreement_points: string[];
};

export type FinalVerdict = {
  one_line_verdict: string;
  summary: string;
  top_strengths: string[];
  top_weaknesses: string[];
  who_should_buy: string[];
  who_should_skip: string[];
  upgrade_advice: string;
  buying_advice: string;
  content_angle: string;
  confidence: "low" | "medium" | "high";
};


const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:32b";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const COMMENTS_URL = "https://www.googleapis.com/youtube/v3/commentThreads";

const SYSTEM_PROMPT = `
You are Ypicky Product Community Judge.

Your job is to analyze YouTube review videos and user comments about a consumer product.

The user searches for a product they may buy.
Ypicky should help the user understand the real community consensus, not marketing claims.

Use only:
- search query
- video title
- channel title
- description
- view count
- like count
- comment count
- user comments
- review transcript if available
- transcript language

Do not assume facts that are not present.

Classify the video into exactly one content_type:
official_promo, professional_review, user_review, comparison_review, long_term_review, unboxing, troubleshooting, unrelated, low_quality_duplicate, unknown.

valid_product_signal:
true if the video/comments are useful for understanding real user experience about the searched product.
false if it is unrelated, pure ad, low quality duplicate, clickbait, or unclear.

Scoring:
review_relevance_score: 0 to 10.
real_user_signal_score: 0 to 10.
purchase_decision_value_score: 0 to 10.
complaint_signal_score: 0 to 10.
praise_signal_score: 0 to 10.
overall_recommendation_confidence: 0 to 10.

Important:
- Do not reward only popularity.
- A high view count does not automatically mean high value.
- Marketing claims are weak signals.
- Comments from actual owners, comparisons, long-term usage, comfort, defects, battery, ANC, call quality, app issues, warranty, and return experiences are strong signals.
- If comments repeatedly mention the same complaint, treat it as important.
- If the video is official promo, lower real_user_signal_score unless comments contain real owner feedback.
- If invalid, overall_recommendation_confidence must be 0 and positive_signals must be [].
- Do not invent prices, availability, or shipping information.
- Do not mention affiliate links.
- Do not create or mention any community score, rating, star rating, numeric score, or grade.
- The final result must not include community_score.
- Reason must cite concrete evidence from comments, title, description, or channel.
- Analyze both Korean and English content.
- Always write the final output in Korean.
- If transcript is available, extract reviewer claims from the transcript.
- Compare reviewer claims with user comments.
- Separate reviewer claims from community reactions.
- If English transcript/comments are used, translate their meaning naturally into Korean.

Return JSON only.
Do not include markdown.
Do not include explanations outside JSON.

Schema:
{
  "valid_product_signal": true,
  "content_type": "professional_review",
  "review_relevance_score": 0,
  "real_user_signal_score": 0,
  "purchase_decision_value_score": 0,
  "complaint_signal_score": 0,
  "praise_signal_score": 0,
  "overall_recommendation_confidence": 0,
  "community_consensus": "구체적인 한국어 요약",
  "who_should_buy": ["출퇴근 사용자", "ANC 중시 사용자"],
  "who_should_skip": ["순수 음질만 중시하는 사용자"],
  "pros": ["구체 장점"],
  "cons": ["구체 단점"],
  "watch_points": ["구매 전 확인할 점"],
  "positive_signals": ["댓글/제목/설명에서 확인되는 구체 신호"],
  "negative_signals": ["댓글/제목/설명에서 확인되는 구체 신호"],
  "best_use_case": "이 제품이 가장 잘 맞는 사용 상황",
  "reviewer_claims": ["리뷰어가 영상에서 주장한 핵심 내용"],
  "community_reactions": ["댓글에서 확인되는 실제 사용자 반응"],
  "agreement_points": ["리뷰어 주장과 댓글 반응이 일치하는 부분"],
  "disagreement_points": ["리뷰어 주장과 댓글 반응이 엇갈리는 부분"]
}
`;




async function fetchTranscript(videoId: string) {
  const preferredLanguages = ["ko", "en"];

  for (const lang of preferredLanguages) {
    try {
      const items = await YoutubeTranscript.fetchTranscript(videoId, {
        lang,
      });

      const text = items
        .map((item: any) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (text) {
        return {
          transcript: text.slice(0, 12000),
          transcriptLanguage: lang,
        };
      }
    } catch {
      // try next language
    }
  }

  return {
    transcript: "",
    transcriptLanguage: "",
  };
}


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

async function searchVideos(query: string, maxResults = Number(process.env.YOUTUBE_REVIEW_SEARCH_LIMIT ?? 18)) {
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
  if (videoIds.length === 0) {
    return {};
  }

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

async function fetchTopComments(videoId: string, maxResults = Number(process.env.YOUTUBE_REVIEW_COMMENT_LIMIT ?? 60)) {
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

async function collectCandidates(
  query: string,
  onItemDone?: (done: number, total: number, title: string) => Promise<void> | void,
): Promise<YoutubeCandidate[]> {
  const candidates = await searchVideos(query, Number(process.env.YOUTUBE_REVIEW_SEARCH_LIMIT ?? 18));
  const videoIds = candidates.map((item: any) => item.videoId);
  const statsMap = await fetchVideoStats(videoIds);
  let done = 0;

  return mapWithConcurrency(candidates, 3, async (item: any) => {
    const stats = statsMap[item.videoId] ?? {};
    const [comments, transcriptResult] = await Promise.all([
      fetchTopComments(item.videoId, Number(process.env.YOUTUBE_REVIEW_COMMENT_LIMIT ?? 60)),
      fetchTranscript(item.videoId),
    ]);

    const enriched = {
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
      transcript: transcriptResult.transcript,
      transcriptLanguage: transcriptResult.transcriptLanguage,
    };

    done += 1;
    await onItemDone?.(done, candidates.length, enriched.title);

    return enriched;
  });
}


function fallbackJudgement(reason: string): ProductJudgement {
  return {
    valid_product_signal: false,
    content_type: "unknown",

    review_relevance_score: 0,
    real_user_signal_score: 0,
    purchase_decision_value_score: 0,

    complaint_signal_score: 0,
    praise_signal_score: 0,

    overall_recommendation_confidence: 0,

    community_consensus: reason,
    reviewer_claims: [],
    community_reactions: [],
    agreement_points: [],
    disagreement_points: [],

    who_should_buy: [],
    who_should_skip: [],

    pros: [],
    cons: [],

    watch_points: [],

    positive_signals: [],
    negative_signals: [reason],

    best_use_case: "Ypicky 추천 판단 대상에서 제외",
  };
}

function normalizeJudgement(input: any): ProductJudgement {
  const parsed: ProductJudgement = {
    valid_product_signal: Boolean(input.valid_product_signal),
    content_type: String(input.content_type ?? "unknown"),

    review_relevance_score: Number(input.review_relevance_score ?? 0),
    real_user_signal_score: Number(input.real_user_signal_score ?? 0),
    purchase_decision_value_score: Number(
      input.purchase_decision_value_score ?? 0,
    ),

    complaint_signal_score: Number(input.complaint_signal_score ?? 0),
    praise_signal_score: Number(input.praise_signal_score ?? 0),

    overall_recommendation_confidence: Number(
      input.overall_recommendation_confidence ?? 0,
    ),

    community_consensus: String(input.community_consensus ?? ""),

    who_should_buy: Array.isArray(input.who_should_buy)
      ? input.who_should_buy.map(String)
      : [],

    who_should_skip: Array.isArray(input.who_should_skip)
      ? input.who_should_skip.map(String)
      : [],

    pros: Array.isArray(input.pros) ? input.pros.map(String) : [],
    cons: Array.isArray(input.cons) ? input.cons.map(String) : [],

    watch_points: Array.isArray(input.watch_points)
      ? input.watch_points.map(String)
      : [],

    positive_signals: Array.isArray(input.positive_signals)
      ? input.positive_signals.map(String)
      : [],

    negative_signals: Array.isArray(input.negative_signals)
      ? input.negative_signals.map(String)
      : [],

    best_use_case: String(input.best_use_case ?? ""),
    
    reviewer_claims: Array.isArray(input.reviewer_claims)
      ? input.reviewer_claims.map(String)
      : [],
 
    community_reactions: Array.isArray(input.community_reactions)
      ? input.community_reactions.map(String)
      : [],

    agreement_points: Array.isArray(input.agreement_points)
      ? input.agreement_points.map(String)
      : [],

    disagreement_points: Array.isArray(input.disagreement_points)
      ? input.disagreement_points.map(String)
      : [],		
  };

  if (parsed.valid_product_signal === false) {
    parsed.positive_signals = [];
    parsed.overall_recommendation_confidence = 0;
    parsed.best_use_case = "Ypicky 추천 판단 대상에서 제외";
  }
  
  
  return parsed;
}

async function judgeCandidate(
  query: string,
  candidate: YoutubeCandidate,
): Promise<ProductJudgement> {
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
      transcript: candidate.transcript,
      transcriptLanguage: candidate.transcriptLanguage,
    },
  };

  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    signal: withTimeout(10 * 60 * 1000),
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt:
        SYSTEM_PROMPT +
        "\n\nAnalyze this YouTube product review candidate:\n\n" +
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
  const raw = data.response ?? "";

  try {
    return normalizeJudgement(JSON.parse(raw));
  } catch {
    return fallbackJudgement("LLM JSON 파싱 실패");
  }
}


function fallbackFinalVerdict(reason: string): FinalVerdict {
  return {
    one_line_verdict: "종합 리뷰 생성 실패",
    summary: reason,
    top_strengths: [],
    top_weaknesses: [],
    who_should_buy: [],
    who_should_skip: [],
    upgrade_advice: "",
    buying_advice: "",
    content_angle: "",
    confidence: "low",
  };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

async function generateFinalVerdict(
  query: string,
  ranked: Array<YoutubeCandidate & { judgement: ProductJudgement }>,
): Promise<FinalVerdict> {
  const valid = ranked
    .filter((item) => item.judgement.valid_product_signal)
    .slice(0, 10)
    .map((item) => ({
      title: item.title,
      channelTitle: item.channelTitle,
      viewCount: item.viewCount,
      commentCount: item.commentCount,
      judgement: item.judgement,
    }));

  const prompt = `
You are TuneMyFi Final Verdict Writer.

You create a final Korean consumer review by synthesizing multiple YouTube review analyses and user comment insights.

The user searched for:
${query}

You must synthesize the following review analyses into one final review.

Rules:
- Write in Korean.
- Do not invent price, availability, shipping, or specs not present in the input.
- Focus on repeated patterns across reviews/comments.
- Separate strong consensus from weak or mixed signals.
- Make the result useful as original TuneMyFi content.
- Mention if the product is better for new buyers than upgraders when the evidence suggests it.
- Do not mention affiliate links.
- Do not create or mention any community score, rating, star rating, numeric score, or grade.
- The final result must not include community_score.

Return JSON only.

Schema:
{
  "one_line_verdict": "한 줄 결론",
  "summary": "종합 요약",
  "top_strengths": ["반복적으로 확인된 장점"],
  "top_weaknesses": ["반복적으로 확인된 단점"],
  "who_should_buy": ["추천 대상"],
  "who_should_skip": ["비추천 대상"],
  "upgrade_advice": "기존 모델 사용자 업그레이드 조언",
  "buying_advice": "신규 구매자 조언",
  "content_angle": "유튜브/블로그 콘텐츠 제목으로 쓸 만한 관점",
  "confidence": "low | medium | high"
}

Input:
${JSON.stringify(valid, null, 2)}
`;

  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    signal: withTimeout(10 * 60 * 1000),
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      format: "json",
      options: {
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) {
    return fallbackFinalVerdict("Ollama final verdict 호출 실패");
  }

  const data = await res.json();
  const raw = data.response ?? "";

  try {
    const parsed = JSON.parse(raw);

    return {
      one_line_verdict: String(parsed.one_line_verdict ?? ""),
      summary: String(parsed.summary ?? ""),
      top_strengths: normalizeStringArray(parsed.top_strengths),
      top_weaknesses: normalizeStringArray(parsed.top_weaknesses),
      who_should_buy: normalizeStringArray(parsed.who_should_buy),
      who_should_skip: normalizeStringArray(parsed.who_should_skip),
      upgrade_advice: String(parsed.upgrade_advice ?? ""),
      buying_advice: String(parsed.buying_advice ?? ""),
      content_angle: String(parsed.content_angle ?? ""),
      confidence: ["low", "medium", "high"].includes(parsed.confidence)
        ? parsed.confidence
        : "medium",
    };
  } catch {
    return fallbackFinalVerdict("Final Verdict JSON 파싱 실패");
  }
}



export type ExploreProgress = {
  progress: number;
  message: string;
  phase?: string;
};

export type ExploreResult = {
  mode: string;
  query: string;
  querySlug: string;
  model: string;
  count: number;
  rankedFile: string;
  verdictFile: string;
  finalVerdict: FinalVerdict;
  ranked: Array<YoutubeCandidate & { judgement: ProductJudgement }>;
};

function withTimeout(ms: number) {
  return AbortSignal.timeout(ms);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

export async function runExplore(
  query: string,
  onProgress?: (progress: ExploreProgress) => Promise<void> | void,
): Promise<ExploreResult> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    throw new Error("검색어를 입력하세요.");
  }

  const emit = async (progress: number, message: string, phase?: string) => {
    await onProgress?.({ progress, message, phase });
  };

  await emit(3, "YouTube 리뷰 후보를 더 넓게 검색 중", "search");
  const candidates = await collectCandidates(trimmedQuery, async (done, total, title) => {
    const ratio = total === 0 ? 0 : done / total;
    await emit(
      Math.round(8 + ratio * 27),
      `충분한 댓글/Transcript 수집 중 (${done}/${total})${title ? ` · ${title}` : ""}`,
      "collect",
    );
  });

  const ranked: Array<YoutubeCandidate & { judgement: ProductJudgement }> = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    await emit(
      Math.round(35 + (i / Math.max(candidates.length, 1)) * 53),
      `LLM Judge 분석 중 (${i + 1}/${candidates.length}) · ${candidate.title}`,
      "judge",
    );

    let judgement: ProductJudgement;
    try {
      judgement = await judgeCandidate(trimmedQuery, candidate);
    } catch (error: any) {
      judgement = fallbackJudgement(
        `LLM Judge 호출 실패: ${error?.message ?? "unknown error"}`,
      );
    }

    ranked.push({
      ...candidate,
      judgement,
    });
  }

  ranked.sort(
    (a, b) =>
      (b.judgement.overall_recommendation_confidence ?? 0) -
      (a.judgement.overall_recommendation_confidence ?? 0),
  );

  await emit(90, "Final Verdict 생성 중", "final-verdict");
  const finalVerdict = await generateFinalVerdict(trimmedQuery, ranked);

  const projectRoot = path.resolve(process.cwd(), "..");
  const querySlug = slugify(trimmedQuery);

  const rankedDir = path.join(projectRoot, "data", "ranked");
  const verdictDir = path.join(projectRoot, "data", "verdicts");

  await mkdir(rankedDir, { recursive: true });
  await mkdir(verdictDir, { recursive: true });

  const rankedPayload = {
    query: trimmedQuery,
    model: OLLAMA_MODEL,
    candidateCount: candidates.length,
    ranked,
    finalVerdict,
    createdAt: new Date().toISOString(),
  };

  await emit(96, "분석 결과 파일 저장 중", "save");

  await writeFile(
    path.join(rankedDir, `${querySlug}.ranked.json`),
    JSON.stringify(rankedPayload, null, 2),
    "utf-8",
  );

  await writeFile(
    path.join(verdictDir, `${querySlug}.verdict.json`),
    JSON.stringify(finalVerdict, null, 2),
    "utf-8",
  );

  await emit(100, "Review Analysis 완료", "completed");

  return {
    mode: "tunemyfi-community-intelligence",
    query: trimmedQuery,
    querySlug,
    model: OLLAMA_MODEL,
    count: ranked.length,
    rankedFile: `data/ranked/${querySlug}.ranked.json`,
    verdictFile: `data/verdicts/${querySlug}.verdict.json`,
    finalVerdict,
    ranked,
  };
}
