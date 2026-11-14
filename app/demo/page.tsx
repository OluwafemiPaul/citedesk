"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Markdown } from "@/lib/markdown";
import { SAMPLE_QUESTIONS } from "@/lib/samples";
import { addLog } from "@/lib/logs";
import type { ChatMessage, ChatResponse } from "@/lib/types";

type Turn = { role: "user"; content: string } | { role: "assistant"; content: string; data: ChatResponse };

const KEY_STORAGE = "ledgerly_user_key";

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  normal: "bg-sky-100 text-sky-800",
  low: "bg-slate-100 text-slate-700",
};

export default function ChatPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverKey, setServerKey] = useState<boolean | null>(null);
  const [userKey, setUserKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then((d) => setServerKey(Boolean(d.serverKey))).catch(() => setServerKey(false));
    try {
      setUserKey(sessionStorage.getItem(KEY_STORAGE) ?? "");
    } catch {}
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  function saveKey(k: string) {
    setUserKey(k);
    try {
      if (k) sessionStorage.setItem(KEY_STORAGE, k);
      else sessionStorage.removeItem(KEY_STORAGE);
    } catch {}
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setInput("");
    const history: ChatMessage[] = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, { role: "user", content: q }]);
    setLoading(true);
    try {
      const res = await fetch("/api/demo-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(userKey ? { "x-user-api-key": userKey } : {}) },
        body: JSON.stringify({ question: q, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      const reply = data as ChatResponse;
      setTurns((t) => [...t, { role: "assistant", content: reply.answer, data: reply }]);
      addLog({
        ts: new Date().toISOString(),
        question: q,
        mode: reply.mode,
        confidence: reply.confidence,
        handoff: reply.handoff,
        handoffReason: reply.handoffReason,
        citations: reply.citations.map((c) => c.id),
        ticket: reply.ticket,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const live = Boolean(userKey) || serverKey;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <section className="flex min-h-[70vh] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <h1 className="font-semibold">Ask Ledgerly Support</h1>
            <p className="text-xs text-slate-500">Answers come only from the Ledgerly help center, with sources.</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${live ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
            {serverKey === null ? "Checking..." : live ? "Live AI" : "Demo mode"}
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {turns.length === 0 && (
            <div className="py-6 text-center">
              <p className="text-lg font-medium">Hi! How can we help your business today?</p>
              <p className="mt-1 text-sm text-slate-500">Try one of these questions, or type your own.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SAMPLE_QUESTIONS.map((q) => (
                  <button key={q} onClick={() => ask(q)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm hover:border-emerald-400 hover:bg-emerald-50">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-emerald-600 px-4 py-2.5 text-sm text-white">{t.content}</div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[90%] space-y-3">
                  <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <Markdown text={t.content} />
                  </div>
                  {t.data.citations.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-slate-500">Sources:</span>
                      {t.data.citations.map((c) => (
                        <Link key={c.id} href={`/demo/docs/${c.id}`} target="_blank" className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-emerald-700 hover:border-emerald-400">
                          {c.title}
                        </Link>
                      ))}
                    </div>
                  )}
                  {t.data.handoff && t.data.ticket && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-amber-900">Handed off to a human agent</span>
                        <span className={`rounded-full px-2 py-0.5 font-medium ${PRIORITY_STYLE[t.data.ticket.priority] ?? PRIORITY_STYLE.normal}`}>{t.data.ticket.priority}</span>
                      </div>
                      <p className="mt-1.5 text-amber-900">
                        <span className="font-medium">Ticket summary:</span> {t.data.ticket.summary}
                      </p>
                      <p className="mt-1 text-amber-800">Category: {t.data.ticket.category} · Reason: {t.data.handoffReason}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span>Confidence: {t.data.confidence}</span>
                    <span>· {t.data.mode === "live" ? "Live AI answer" : "Demo mode answer"}</span>
                    {t.data.redacted && <span className="text-red-600">· Sensitive numbers were removed from your message</span>}
                  </div>
                  {t.data.notice && <p className="text-[11px] text-slate-500">{t.data.notice}</p>}
                </div>
              </div>
            )
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">Checking the help center...</div>
            </div>
          )}
          {error && <p className="text-center text-sm text-red-600">{error}</p>}
          <div ref={bottom} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex gap-2 border-t border-slate-100 p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={1500}
            placeholder="Ask about payouts, fees, cards, verification..."
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
          />
          <button disabled={loading || !input.trim()} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">
            Send
          </button>
        </form>
      </section>

      <aside className="space-y-4 text-sm">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">How it works</h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-slate-600">
            <li>Your question is checked for card or ID numbers, which are removed.</li>
            <li>The agent searches 21 help articles for the best matches.</li>
            <li>Claude answers only from those articles and cites them.</li>
            <li>Security issues, account specific requests or low confidence answers go to a human with a ready ticket.</li>
          </ol>
          <Link href="/demo/admin" className="mt-3 inline-block text-emerald-700 hover:underline">See the admin dashboard →</Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <button onClick={() => setShowSettings((s) => !s)} className="flex w-full items-center justify-between font-semibold">
            Settings <span className="text-slate-400">{showSettings ? "Hide" : "Show"}</span>
          </button>
          {showSettings && (
            <div className="mt-3 space-y-2">
              <label className="block text-xs text-slate-600">Use your own Anthropic API key (optional)</label>
              <input
                type="password"
                value={userKey}
                onChange={(e) => saveKey(e.target.value.trim())}
                placeholder="sk-ant-..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-emerald-500"
              />
              <p className="text-[11px] text-slate-500">Kept only in this browser tab and sent directly with your questions. Never stored on the server.</p>
              <button onClick={() => setTurns([])} className="text-xs text-slate-600 underline">Clear conversation</button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
