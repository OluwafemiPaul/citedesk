"use client";

import Link from "next/link";
import { useState } from "react";

type Row = { name: string; state: "waiting" | "uploading" | "done" | "error"; text?: string };

export function Uploader() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 20);
    setRows(list.map((f) => ({ name: f.name, state: "waiting" })));
    setBusy(true);
    for (let i = 0; i < list.length; i++) {
      setRows((r) => r.map((x, j) => (j === i ? { ...x, state: "uploading" } : x)));
      const body = new FormData();
      body.set("file", list[i]);
      try {
        const res = await fetch("/api/upload", { method: "POST", body });
        const data = await res.json().catch(() => ({ error: res.status === 413 ? "File too large." : "Upload failed." }));
        setRows((r) => r.map((x, j) => (j === i ? (res.ok ? { ...x, state: "done", text: `${data.articles} draft article${data.articles === 1 ? "" : "s"}` } : { ...x, state: "error", text: data.error }) : x)));
      } catch {
        setRows((r) => r.map((x, j) => (j === i ? { ...x, state: "error", text: "Upload failed. Check your connection." } : x)));
      }
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 p-8 text-center text-sm hover:border-indigo-400">
        <span className="font-medium text-indigo-700">Choose files</span> (PDF or .docx, you can pick several)
        <input type="file" multiple accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files)} />
      </label>
      {rows.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          {rows.map((r) => (
            <li key={r.name} className="flex justify-between gap-3 p-3">
              <span className="truncate">{r.name}</span>
              <span className={r.state === "error" ? "text-red-700" : r.state === "done" ? "text-green-700" : "text-slate-500"}>
                {r.state === "waiting" ? "Waiting" : r.state === "uploading" ? "Reading..." : r.text}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!busy && rows.some((r) => r.state === "done") && (
        <Link href="/app/articles?status=draft" className="inline-block rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Review the new drafts</Link>
      )}
    </div>
  );
}
