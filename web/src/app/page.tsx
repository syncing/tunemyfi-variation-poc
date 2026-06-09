"use client";

import { useState } from "react";


type FinalVerdict = {
  community_score: number;
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


type ProductResult = {
  videoId: string;
  url: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  comments: string[];
  judgement: {
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
  };
};

export default function Home() {
  const [query, setQuery] = useState("Sony WH-1000XM6 review");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ProductResult[]>([]);
  const [error, setError] = useState("");
  const [model, setModel] = useState("");
  const [finalVerdict, setFinalVerdict] = useState<FinalVerdict | null>(null);
 
  async function search() {
    console.log("search clicked:", query);
    
    setFinalVerdict(null);
    setLoading(true);
    setError("");
    setResults([]);
    setModel("");

    try {
      const res = await fetch("/api/explore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "검색 실패");
      }

      setFinalVerdict(data.finalVerdict ?? null);
      setResults(data.ranked ?? []);
      setModel(data.model ?? "");
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "오류 발생");
    } finally {
      
      setLoading(false);
    }
  }

  const validResults = results.filter(
    (item) => item.judgement.valid_product_signal,
  );

  const invalidCount = results.length - validResults.length;

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <section className="mx-auto max-w-4xl px-5 py-8">
        <div className="mb-4 inline-flex rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300">
          Ypicky Community Intelligence POC
        </div>

        <h1 className="text-3xl font-bold leading-tight">
          리뷰 댓글을 읽고
          <br />
          진짜 구매 포인트를 찾아드립니다
        </h1>

        <p className="mt-4 text-sm leading-6 text-neutral-400">
          YouTube 리뷰 영상과 댓글을 Local LLM이 분석해 실제 사용자
          관점의 장점, 단점, 구매 전 확인 포인트를 정리합니다.
        </p>

        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm outline-none focus:border-white"
            placeholder="예: Sony WH-1000XM6 review"
          />

          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50"
          >
            {loading ? "분석중..." : "검색"}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-500">
          <button
            type="button"
            onClick={() => setQuery("Sony WH-1000XM6 review")}
            className="rounded-full border border-neutral-800 px-3 py-1 hover:border-neutral-500"
          >
            Sony WH-1000XM6
          </button>
          <button
            type="button"
            onClick={() => setQuery("Sony WH-1000XM6 vs Bose QC Ultra")}
            className="rounded-full border border-neutral-800 px-3 py-1 hover:border-neutral-500"
          >
            XM6 vs Bose QC Ultra
          </button>
          <button
            type="button"
            onClick={() => setQuery("AirPods Pro 2 review")}
            className="rounded-full border border-neutral-800 px-3 py-1 hover:border-neutral-500"
          >
            AirPods Pro 2
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-800 bg-red-950 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-300">
            YouTube 검색 → 댓글 수집 → Local LLM 분석 중...
            <br />
            qwen3:32b 기준 첫 실행은 시간이 걸릴 수 있습니다.
          </div>
        )}

        {finalVerdict && (
          <div className="mt-8 rounded-2xl border border-white/20 bg-white p-5 text-black">
            <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">
              TuneMyFi Final Verdict
            </div>

            <div className="mt-4 flex items-center gap-4">
              <div className="rounded-2xl bg-black px-4 py-3 text-2xl font-bold text-white">
                {finalVerdict.community_score}
              </div>
              <div>
                <div className="text-sm text-neutral-500">
                  Community Score · confidence: {finalVerdict.confidence}
                </div>
                <h2 className="mt-1 text-xl font-bold">
                  {finalVerdict.one_line_verdict}
                </h2>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-neutral-800">
              {finalVerdict.summary}
            </p>

            {finalVerdict.content_angle && (
              <div className="mt-4 rounded-xl bg-neutral-100 p-3 text-sm">
                <div className="mb-1 text-xs font-bold uppercase text-neutral-500">
                  Content Angle
                </div>
                {finalVerdict.content_angle}
              </div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-neutral-100 p-4">
                <div className="text-xs font-bold uppercase text-green-700">
                  반복 확인된 장점
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {finalVerdict.top_strengths.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl bg-neutral-100 p-4">
                <div className="text-xs font-bold uppercase text-red-700">
                  반복 확인된 단점
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {finalVerdict.top_weaknesses.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-neutral-100 p-4">
                <div className="text-xs font-bold uppercase text-neutral-600">
                  추천 대상
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {finalVerdict.who_should_buy.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl bg-neutral-100 p-4">
                <div className="text-xs font-bold uppercase text-neutral-600">
                  비추천 대상
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {finalVerdict.who_should_skip.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {finalVerdict.upgrade_advice && (
              <div className="mt-4 rounded-xl bg-neutral-100 p-4 text-sm">
                <div className="mb-1 text-xs font-bold uppercase text-neutral-500">
                  Upgrade Advice
                </div>
                {finalVerdict.upgrade_advice}
              </div>
            )}

            {finalVerdict.buying_advice && (
              <div className="mt-3 rounded-xl bg-neutral-100 p-4 text-sm">
                <div className="mb-1 text-xs font-bold uppercase text-neutral-500">
                  Buying Advice
                </div>
                {finalVerdict.buying_advice}
              </div>
            )}
          </div>
        )}


        {results.length > 0 && (
          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              Analysis Summary
            </div>
            <div className="mt-2 text-sm text-neutral-300">
              총 {results.length}개 영상 분석 · 유효 리뷰 신호{" "}
              {validResults.length}개 · 제외 {invalidCount}개
              {model ? ` · model: ${model}` : ""}
            </div>
          </div>
        )}

        <div className="mt-8 space-y-4">
          {validResults.map((item, index) => {
            const j = item.judgement;

            return (
              <div
                key={item.videoId}
                className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs text-neutral-500">
                      #{index + 1} · {j.content_type} · {item.channelTitle}
                    </div>

                    <h2 className="mt-1 text-lg font-semibold leading-6">
                      {item.title}
                    </h2>
                  </div>

                  <div className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-black">
                    {j.overall_recommendation_confidence}
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-neutral-950 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                    Community Consensus
                  </div>
                  <p className="mt-2 text-sm leading-6 text-neutral-300">
                    {j.community_consensus}
                  </p>
                </div>

                {j.best_use_case && (
                  <div className="mt-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                      Best Use Case
                    </div>
                    <p className="mt-1 text-sm leading-6 text-neutral-300">
                      {j.best_use_case}
                    </p>
                  </div>
                )}

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {j.pros?.length > 0 && (
                    <div className="rounded-xl border border-neutral-800 p-4">
                      <div className="text-xs font-bold uppercase tracking-wide text-green-400">
                        Pros
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
                        {j.pros.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {j.cons?.length > 0 && (
                    <div className="rounded-xl border border-neutral-800 p-4">
                      <div className="text-xs font-bold uppercase tracking-wide text-red-400">
                        Cons
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
                        {j.cons.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {j.who_should_buy?.length > 0 && (
                    <div className="rounded-xl border border-neutral-800 p-4">
                      <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                        Who Should Buy
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
                        {j.who_should_buy.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {j.who_should_skip?.length > 0 && (
                    <div className="rounded-xl border border-neutral-800 p-4">
                      <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                        Who Should Skip
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
                        {j.who_should_skip.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {j.watch_points?.length > 0 && (
                  <div className="mt-4 rounded-xl border border-neutral-800 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-yellow-400">
                      Watch Points
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
                      {j.watch_points.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-neutral-400 md:grid-cols-3">
                  <div className="rounded-lg bg-neutral-950 p-3">
                    리뷰 관련성: {j.review_relevance_score}
                  </div>
                  <div className="rounded-lg bg-neutral-950 p-3">
                    실사용 신호: {j.real_user_signal_score}
                  </div>
                  <div className="rounded-lg bg-neutral-950 p-3">
                    구매 판단 가치: {j.purchase_decision_value_score}
                  </div>
                  <div className="rounded-lg bg-neutral-950 p-3">
                    칭찬 신호: {j.praise_signal_score}
                  </div>
                  <div className="rounded-lg bg-neutral-950 p-3">
                    불만 신호: {j.complaint_signal_score}
                  </div>
                </div>

                {j.positive_signals?.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                      Positive Signals
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
                      {j.positive_signals.slice(0, 5).map((signal, idx) => (
                        <li key={idx}>{signal}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {j.negative_signals?.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                      Negative Signals
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
                      {j.negative_signals.slice(0, 5).map((signal, idx) => (
                        <li key={idx}>{signal}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-4 text-xs text-neutral-500">
                  <span>조회수 {item.viewCount.toLocaleString()}</span>
                  <span>좋아요 {item.likeCount.toLocaleString()}</span>
                  <span>댓글 {item.commentCount.toLocaleString()}</span>
                </div>

                <div className="mt-4">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-blue-400 hover:text-blue-300"
                  >
                    YouTube 리뷰 보기 →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
