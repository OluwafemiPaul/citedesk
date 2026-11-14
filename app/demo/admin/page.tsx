"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { clearLogs, readLogs, saveLogs, type LogEntry } from "@/lib/logs";

// Example data so the dashboard is useful even before anyone chats.
function sampleLogs(): LogEntry[] {
  const now = Date.now();
  const rows: [string, boolean, LogEntry["confidence"], string[], string?, string?][] = [
    ["When will I get my first payout?", false, "high", ["payout-schedule"]],
    ["How much are instant payouts?", false, "high", ["instant-payouts"]],
    ["What are your fees for card payments?", false, "high", ["fees-pricing"]],
    ["My payout po_8XK2 is 3 days late", true, "medium", ["payout-delayed"], "Needs a lookup on a specific transaction", "Payouts"],
    ["Customer opened a dispute, what now?", false, "high", ["chargebacks"]],
    ["Do you support crypto payments?", true, "low", [], "No matching help article", "General"],
    ["Can I get a loan from Ledgerly?", true, "low", [], "No matching help article", "General"],
    ["I didn't make these card charges", true, "high", ["card-lost", "fraud-phishing"], "Possible account takeover or unauthorized activity", "Security"],
    ["How do I add my accountant?", false, "high", ["team-members"]],
    ["Which IDs do you accept?", false, "high", ["verification-documents"]],
    ["Why was my card declined at a gas station?", false, "medium", ["card-declined"]],
    ["Can I send an international wire?", false, "high", ["transfers-ach", "supported-countries"]],
    ["Do you offer a business savings account?", true, "low", [], "No matching help article", "General"],
    ["I want to talk to a real person", true, "high", [], "Customer asked for a person", "General"],
    ["When do I get my 1099K?", false, "high", ["statements-taxes"]],
  ];
  return rows.map(([question, handoff, confidence, citations, reason, category], i) => ({
    ts: new Date(now - (rows.length - i) * 3600_000).toISOString(),
    question,
    mode: "demo",
    confidence,
    handoff,
    handoffReason: reason,
    citations,
    ticket: handoff ? { summary: reason ?? "", category: category ?? "General", priority: category === "Security" ? "urgent" : "normal", customerQuestion: question } : undefined,
    sample: true,
  }));
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  useEffect(() => setLogs(readLogs()), []);

  const stats = useMemo(() => {
    const total = logs.length;
    const handed = logs.filter((l) => l.handoff).length;
    const resolved = total - handed;
    const gaps = logs.filter((l) => (l.confidence === "low" || l.citations.length === 0) && l.handoffReason !== "Customer asked for a person");
    const counts = new Map<string, number>();
    for (const l of logs) for (const c of l.citations) counts.set(c, (counts.get(c) ?? 0) + 1);
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const reasons = new Map<string, number>();
    for (const l of logs) if (l.handoff) reasons.set(l.handoffReason ?? "Other", (reasons.get(l.handoffReason ?? "Other") ?? 0) + 1);
    return { total, handed, resolved, gaps, top, reasons: Array.from(reasons.entries()).sort((a, b) => b[1] - a[1]) };
  }, [logs]);

  const pct = (n: number) => (stats.total ? `${Math.round((n / stats.total) * 100)}%` : "0%");
  const maxTop = stats.top[0]?.[1] ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Support admin dashboard</h1>
          <p className="text-sm text-slate-500">What customers asked, what the agent resolved, and where the help center has gaps. Data stays in your browser.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <button
            onClick={() => {
              const merged = [...readLogs().filter((l) => !l.sample), ...sampleLogs()];
              saveLogs(merged);
              setLogs(merged);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:border-emerald-400"
          >
            Load sample data
          </button>
          <button
            onClick={() => {
              clearLogs();
              setLogs([]);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:border-red-300"
          >
            Clear
          </button>
        </div>
      </div>

      {stats.total === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          No conversations yet. <Link href="/demo" className="text-emerald-700 underline">Ask a few questions</Link> or click <span className="font-medium">Load sample data</span>.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Questions" value={String(stats.total)} />
            <Stat label="Resolved by the agent" value={pct(stats.resolved)} sub={`${stats.resolved} of ${stats.total}`} />
            <Stat label="Handed off to a human" value={pct(stats.handed)} sub={`${stats.handed} tickets`} />
            <Stat label="Help center gaps" value={String(stats.gaps.length)} sub="Low confidence or no source" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="font-semibold">Most used help articles</h2>
              <div className="mt-3 space-y-2">
                {stats.top.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
                {stats.top.map(([id, n]) => (
                  <div key={id} className="text-sm">
                    <div className="flex justify-between">
                      <Link href={`/demo/docs/${id}`} className="text-emerald-700 hover:underline">{id}</Link>
                      <span className="text-slate-500">{n}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${(n / maxTop) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="font-semibold">Why conversations were handed off</h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {stats.reasons.length === 0 && <li className="text-slate-500">No handoffs yet.</li>}
                {stats.reasons.map(([r, n]) => (
                  <li key={r} className="flex justify-between gap-4">
                    <span>{r}</span>
                    <span className="text-slate-500">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">Help center gaps: questions the docs could not answer</h2>
            <p className="text-xs text-slate-500">Each of these is a candidate for a new help article.</p>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {stats.gaps.length === 0 && <li className="py-2 text-slate-500">No gaps found.</li>}
              {stats.gaps.map((g, i) => (
                <li key={i} className="py-2">{g.question}</li>
              ))}
            </ul>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Question</th>
                  <th className="px-4 py-2">Outcome</th>
                  <th className="px-4 py-2">Confidence</th>
                  <th className="px-4 py-2">Sources</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...logs].reverse().map((l, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{new Date(l.ts).toLocaleString()}</td>
                    <td className="px-4 py-2">{l.question}</td>
                    <td className="px-4 py-2">
                      {l.handoff ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Human: {l.ticket?.priority ?? "normal"}</span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">Resolved</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">{l.confidence}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{l.citations.join(", ") || "none"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
