"use client";

import { useEffect, useMemo, useState } from "react";

type Job = {
  id: string;
  lang: string;
  action: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  publicVideoPath?: string;
  kind?: string;
  error?: string | null;
};

type LocalizedContent = Record<string, any>;

const LANGS = [
  { code: "en", label: "English", native: "English" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "fr", label: "French", native: "Français" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "pt", label: "Portuguese", native: "Português" },
];

function statusLabel(status?: string) {
  if (status === "queued") return "Queued";
  if (status === "running") return "Running";
  if (status === "done") return "Done";
  if (status === "failed") return "Failed";
  return status || "-";
}

function actionLabel(action?: string) {
  if (action === "generate-content") return "Content";
  if (action === "generate-shorts") return "Shorts";
  if (action === "generate-video") return "Longform";
  return action || "-";
}

export default function LocalizedLanguageJobs() {
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [content, setContent] = useState<LocalizedContent>({});
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    const res = await fetch("/api/localized-content/jobs", { cache: "no-store" });
    const data = await res.json();
    if (data.ok) {
      setJobs(data.localizedJobs || {});
      setContent(data.localizedContent || {});
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, []);

  const latestJobs = useMemo(() => {
    const result: Record<string, Record<string, Job>> = {};
    const list = Object.values(jobs).sort((a, b) =>
      String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || ""))
    );

    for (const job of list) {
      result[job.lang] ||= {};
      result[job.lang][job.action] ||= job;
    }

    return result;
  }, [jobs]);

  async function startJob(lang: string, action: string) {
    const key = `${lang}:${action}`;
    setBusyKey(key);
    setMessage("");

    try {
      const res = await fetch("/api/localized-content/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, action }),
      });
      const data = await res.json();

      if (!data.ok) {
        setMessage(data.error || "Job start failed");
      } else {
        setMessage(`${lang} ${actionLabel(action)} job queued`);
      }

      await refresh();
    } catch (error: any) {
      setMessage(error?.message || String(error));
    } finally {
      setBusyKey("");
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-zinc-100">Language Pack Jobs</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Generate localized scripts and videos in the background.
        </p>
      </div>

      {message ? (
        <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4">
        {LANGS.map((lang) => {
          const item = content?.[lang.code] || {};
          const contentJob = latestJobs?.[lang.code]?.["generate-content"];
          const shortsJob = latestJobs?.[lang.code]?.["generate-shorts"];
          const videoJob = latestJobs?.[lang.code]?.["generate-video"];

          return (
            <div
              key={lang.code}
              className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-zinc-100">
                    {lang.label} <span className="text-zinc-500">/ {lang.native}</span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    lang={lang.code}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => startJob(lang.code, "generate-content")}
                    disabled={busyKey === `${lang.code}:generate-content`}
                    className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
                  >
                    Generate Content
                  </button>

                  <button
                    onClick={() => startJob(lang.code, "generate-shorts")}
                    disabled={busyKey === `${lang.code}:generate-shorts`}
                    className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
                  >
                    Generate Shorts
                  </button>

                  <button
                    onClick={() => startJob(lang.code, "generate-video")}
                    disabled={busyKey === `${lang.code}:generate-video`}
                    className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 disabled:opacity-50"
                  >
                    Generate Longform
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-zinc-300 md:grid-cols-3">
                <div className="rounded-lg bg-zinc-950/70 p-3">
                  <div className="text-xs text-zinc-500">Content Job</div>
                  <div>{statusLabel(contentJob?.status)}</div>
                </div>

                <div className="rounded-lg bg-zinc-950/70 p-3">
                  <div className="text-xs text-zinc-500">Shorts Job</div>
                  <div>{statusLabel(shortsJob?.status)}</div>
                </div>

                <div className="rounded-lg bg-zinc-950/70 p-3">
                  <div className="text-xs text-zinc-500">Longform Job</div>
                  <div>{statusLabel(videoJob?.status)}</div>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-sm">
                {item.shortsVideoPath ? (
                  <div>
                    <span className="text-zinc-500">Shorts: </span>
                    <a
                      href={item.shortsVideoPath}
                      target="_blank"
                      className="text-sky-400 underline"
                    >
                      {item.shortsVideoPath}
                    </a>
                  </div>
                ) : null}

                {item.videoPath ? (
                  <div>
                    <span className="text-zinc-500">Longform: </span>
                    <a
                      href={item.videoPath}
                      target="_blank"
                      className="text-sky-400 underline"
                    >
                      {item.videoPath}
                    </a>
                  </div>
                ) : null}

                {contentJob?.error || shortsJob?.error || videoJob?.error ? (
                  <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-red-950/30 p-3 text-xs text-red-200">
                    {contentJob?.error || shortsJob?.error || videoJob?.error}
                  </pre>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
