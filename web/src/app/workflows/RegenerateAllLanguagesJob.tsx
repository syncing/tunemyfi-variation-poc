"use client";

import { useEffect, useMemo, useState } from "react";

type BatchJob = {
  id: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  currentLang?: string | null;
  currentAction?: string | null;
  total?: number;
  done?: number;
  failed?: number;
  error?: string | null;
  steps?: Array<{
    lang: string;
    action: string;
    status: string;
    publicVideoPath?: string | null;
    error?: string | null;
  }>;
};

function actionLabel(action?: string | null) {
  if (action === "generate-content") return "Script";
  if (action === "generate-shorts") return "Shorts";
  if (action === "generate-video") return "Long";
  return action || "-";
}

export default function RegenerateAllLanguagesJob() {
  const [jobs, setJobs] = useState<Record<string, BatchJob>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    const res = await fetch("/api/localized-content/all-jobs", { cache: "no-store" });
    const data = await res.json();
    if (data.ok) {
      setJobs(data.localizedBatchJobs || {});
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, []);

  const latest = useMemo(() => {
    return Object.values(jobs).sort((a, b) =>
      String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || ""))
    )[0];
  }, [jobs]);

  async function start() {
    setBusy(true);
    setMessage("");

    try {
      const res = await fetch("/api/localized-content/all-jobs", {
        method: "POST",
      });
      const data = await res.json();

      if (!data.ok) {
        setMessage(data.error || "Failed to start batch job");
      } else {
        setMessage(`Queued all-language regeneration job: ${data.jobId}`);
      }

      await refresh();
    } catch (error: any) {
      setMessage(error?.message || String(error));
    } finally {
      setBusy(false);
    }
  }

  const progressText = latest
    ? `${latest.done || 0}/${latest.total || 21}`
    : "0/21";

  return (
    <section className="mt-8 rounded-2xl border border-amber-800/60 bg-amber-950/20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">
            Regenerate All Languages
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Rebuild scripts, shorts, and long videos for Korean, English, German,
            French, Japanese, Spanish, and Portuguese.
          </p>
        </div>

        <button
          onClick={start}
          disabled={busy || latest?.status === "running"}
          className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50"
        >
          Regenerate All
        </button>
      </div>

      {message ? (
        <div className="mt-4 rounded-lg border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
          {message}
        </div>
      ) : null}

      {latest ? (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-zinc-500">Latest batch job</div>
              <div className="font-mono text-xs text-zinc-300">{latest.id}</div>
            </div>

            <div className="text-right">
              <div className="text-sm font-semibold text-zinc-100">
                {latest.status} · {progressText}
              </div>
              <div className="text-xs text-zinc-500">
                {latest.currentLang
                  ? `${latest.currentLang} / ${actionLabel(latest.currentAction)}`
                  : "Idle"}
              </div>
            </div>
          </div>

          {latest.steps?.length ? (
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              {latest.steps.map((step, idx) => (
                <div
                  key={`${step.lang}-${step.action}-${idx}`}
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-zinc-100">
                      {step.lang} / {actionLabel(step.action)}
                    </span>
                    <span
                      className={
                        step.status === "done"
                          ? "text-emerald-400"
                          : step.status === "failed"
                            ? "text-red-400"
                            : step.status === "running"
                              ? "text-amber-300"
                              : "text-zinc-500"
                      }
                    >
                      {step.status}
                    </span>
                  </div>

                  {step.publicVideoPath ? (
                    <a
                      href={step.publicVideoPath}
                      target="_blank"
                      className="mt-1 block truncate text-xs text-sky-400 underline"
                    >
                      {step.publicVideoPath}
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {latest.error ? (
            <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-red-950/40 p-3 text-xs text-red-200">
              {latest.error}
            </pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
