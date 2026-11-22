"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkDomain, type VerifyResult } from "./actions";
import type { ImportJob } from "@/lib/importer";

export function VerifyButton({ id }: { id: string }) {
  const [res, setRes] = useState<VerifyResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-2">
      <button
        disabled={pending}
        onClick={() => start(async () => { const r = await checkDomain(id); setRes(r); if (r.ok) router.refresh(); })}
        className="rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Checking..." : "Verify"}
      </button>
      {res && <p className={`rounded-lg p-3 ${res.ok ? "bg-green-50 text-green-900" : "bg-amber-50 text-amber-900"}`}>{res.message}</p>}
    </div>
  );
}

async function call(body: object): Promise<{ job?: ImportJob; error?: string }> {
  const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ error: "Something went wrong. Please try again." }));
}

// Starts an import and keeps asking the server to process the next batch until it is done.
export function ImportRunner({ domain, initialJob }: { domain: string; initialJob: ImportJob | null }) {
  const [job, setJob] = useState<ImportJob | null>(initialJob);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const running = job?.status === "running";
  const loop = useRef(false);

  useEffect(() => {
    if (!running || !job || loop.current) return;
    loop.current = true;
    let cancelled = false;
    (async () => {
      let current = job;
      let failures = 0;
      while (!cancelled && current.status === "running") {
        const r = await call({ action: "step", jobId: current.id });
        if (r.job) {
          current = r.job;
          failures = 0;
          setJob(r.job);
        } else if (++failures >= 3) {
          setError(r.error ?? "The import stopped responding. Click Import again to resume.");
          break;
        }
      }
      loop.current = false;
    })();
    return () => { cancelled = true; loop.current = false; };
  }, [running, job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setError(null);
    setStarting(true);
    const r = await call({ action: "start", domain });
    setStarting(false);
    if (r.error) setError(r.error);
    else if (r.job) setJob(r.job);
  }

  const reasons = new Map<string, number>();
  for (const s of job?.skipped ?? []) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);

  return (
    <div className="space-y-4 text-sm">
      {!running && (
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={starting} onClick={start} className="rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50">
            {starting ? "Reading your sitemap..." : job ? "Import again" : "Import my website"}
          </button>
          <span className="text-slate-500">{job ? "Importing again finds new and changed pages; unchanged pages are skipped." : "Usually takes 1 to 2 minutes for 50 pages. Keep this tab open."}</span>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}

      {job && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              {running ? "Importing..." : job.status === "done" ? "Import finished" : job.status === "stopped" ? "Import stopped" : "Import failed"}
              <span className="ml-2 font-normal text-slate-500">{job.pages_imported} new page{job.pages_imported === 1 ? "" : "s"} of up to {job.page_limit}</span>
            </p>
            {running && <button onClick={async () => { const r = await call({ action: "stop" }); if (r.job) setJob(r.job); }} className="text-red-700 underline">Stop</button>}
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.min(100, (job.pages_imported / Math.max(1, job.page_limit)) * 100)}%` }} />
          </div>
          {running && <p className="text-slate-500">{job.seen.length} pages checked, {job.queue.length} waiting.</p>}
          {job.error && <p className="text-amber-800">{job.error}</p>}
          {!running && job.pages_imported > 0 && (
            <Link href="/app/articles?status=draft&source=website" className="inline-block rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white">Review the new drafts</Link>
          )}
          {(job.skipped?.length ?? 0) > 0 && (
            <details>
              <summary className="cursor-pointer text-slate-600">
                {job.skipped.length} page{job.skipped.length === 1 ? "" : "s"} skipped: {Array.from(reasons.entries()).map(([r, n]) => `${r} (${n})`).join(", ")}
              </summary>
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
                {job.skipped.map((s, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <a href={s.url} target="_blank" rel="noreferrer" className="truncate text-indigo-700 underline">{s.url.replace(/^https?:\/\//, "")}</a>
                    <span className="shrink-0 text-slate-500">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
