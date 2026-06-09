"use client";

import { useState } from "react";

type Result = {
  videoId: string;
  url: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  comments: string[];
  judgement: {
    valid_variation: boolean;
    variation_type: string;
    recommendation_score: number;
    reason: string;
    why_this_version?: string;
    compared_to_original?: string;
    best_for?: string[];
    positive_signals?: string[];
    negative_signals?: string[];
    best_use_case?: string;
  };
};

export default function Home() {
  const [query, setQuery] = useState("Sony WH-1000XM6 review");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState("");

  async function search() {
    setLoading(true);
    setError("");
    setResults([]);

    try {
      const res = await fetch("/api/explore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "검색 실패");
      }

      setResults(data.ranked);
    } catch (err: any) {
      setError(err.message ?? "오류 발생");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <section className="mx-auto max-w-3xl px-5 py-8">
        <div className="mb-4 inline-flex rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300">
          TuneMyFi Variation Explorer
        </div>

        <h1 className="text-3xl font-bold leading-tight">
          제품 리뷰 댓글을 읽고 
          <br />
          진짜 구매 포인트를 찾아드립니다.
        </h1>

        <p className="mt-4 text-sm leading-6 text-neutral-400">
          YouTube 후보와 댓글을 Local LLM이 분석해 구매자 관점에서
          들을 만한 버전을 골라냅니다.
        </p>

        <div className="mt-6 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm outline-none focus:border-white"
            placeholder="예: 아이유 밤편지 라이브"
          />
          <button
            onClick={search}
            disabled={loading}
            className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-black disabled:opacity-50"
          >
            {loading ? "분석중" : "검색"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-300">
            YouTube 후보 수집 후 qwen3:32b로 분석 중입니다. 10개 후보는 시간이
            조금 걸릴 수 있습니다.
          </div>
        )}

        <div className="mt-8 grid gap-4">
          {results.map((item, index) => {
            const j = item.judgement;

            return (
              <a
                key={item.videoId}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 transition hover:border-white"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-neutral-500">
                      #{index + 1} · {j.variation_type} · {item.channelTitle}
                    </div>
                    <h2 className="mt-2 text-lg font-semibold leading-6">
                      {item.title}
                    </h2>
                  </div>

                  <div className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-black">
                    {j.recommendation_score}
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-neutral-300">
                  {j.reason}
                </p>

                {j.why_this_version && (
                  <div className="mt-3 rounded-xl bg-neutral-950 p-3 text-sm text-neutral-300">
                    <div className="mb-1 text-xs font-bold text-neutral-500">
                      왜 이 버전인가
                    </div>
                    {j.why_this_version}
                  </div>
                )}

                {j.compared_to_original && (
                  <div className="mt-3 rounded-xl bg-neutral-950 p-3 text-sm text-neutral-300">
                    <div className="mb-1 text-xs font-bold text-neutral-500">
                      원곡 대비
                    </div>
                    {j.compared_to_original}
                  </div>
                )}

                {j.best_for && j.best_for.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {j.best_for.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {j.positive_signals && j.positive_signals.length > 0 && (
                  <div className="mt-4 text-xs leading-5 text-neutral-500">
                    <b className="text-neutral-400">댓글 신호:</b>{" "}
                    {j.positive_signals.slice(0, 3).join(" / ")}
                  </div>
                )}

                <div className="mt-4 text-xs text-neutral-600">
                  조회수 {item.viewCount.toLocaleString()} · 댓글{" "}
                  {item.commentCount.toLocaleString()}
                </div>
              </a>
            );
          })}
        </div>
      </section>
    </main>
  );
}
