"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/lib/markdown";
import type { EngineReply } from "@/lib/engine";

type Msg = { role: "user" | "assistant"; content: string; reply?: EngineReply };

// Test chat inside the setup wizard (FRD F6.6). Uses the real engine and the business's key,
// and shows the details customers will not see: confidence and why a handoff happened.
export function PreviewChat({ botName, welcome, color }: { botName: string; welcome: string; color: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    setError(null);
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await fetch("/api/preview-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, history }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setMsgs((m) => [...m, { role: "assistant", content: data.answer, reply: data }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="px-4 py-3 text-sm font-medium text-white" style={{ background: color }}>{botName} (preview)</div>
      <div className="max-h-[28rem] space-y-3 overflow-y-auto bg-slate-50 p-4 text-sm">
        <div className="max-w-[85%] rounded-2xl bg-white p-3 shadow-sm">{welcome}</div>
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-2xl p-3 text-white" style={{ background: color }}>{m.content}</div>
          ) : (
            <div key={i} className="max-w-[85%] space-y-2 rounded-2xl bg-white p-3 shadow-sm">
              <Markdown text={m.content} />
              {!!m.reply?.citations.length && (
                <div className="border-t border-slate-100 pt-2 text-xs">
                  <span className="text-slate-500">Sources: </span>
                  {m.reply.citations.map((c, j) => (
                    <span key={c.id}>
                      {j > 0 && ", "}
                      {c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="text-indigo-700 underline">{c.title}</a> : <a href={`/app/articles/${c.id}`} className="text-indigo-700 underline">{c.title}</a>}
                    </span>
                  ))}
                </div>
              )}
              {m.reply && (
                <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                  Only you see this: confidence {m.reply.confidence}
                  {m.reply.handoff ? ` · would hand off to your team (${m.reply.handoffReason})` : " · answered without a handoff"}
                  {m.reply.redacted ? " · a card or ID number was removed" : ""}
                </p>
              )}
            </div>
          ),
        )}
        {busy && <div className="max-w-[85%] rounded-2xl bg-white p-3 text-slate-400 shadow-sm">Thinking...</div>}
        <div ref={end} />
      </div>
      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>}
      <form onSubmit={send} className="flex gap-2 border-t border-slate-200 bg-white p-3">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} placeholder="Ask what a customer would ask" aria-label="Test question" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button disabled={busy || !text.trim()} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: color }}>Send</button>
      </form>
    </div>
  );
}
