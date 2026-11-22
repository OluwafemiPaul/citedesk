"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/lib/markdown";

type Msg = {
  role: "user" | "assistant";
  content: string;
  id?: string;
  citations?: { title: string; url: string }[];
  handoff?: boolean;
  rating?: 1 | -1;
};

export type ChatAppProps = {
  publicId: string;
  name: string;
  welcome: string;
  color: string;
  logo: string | null;
  channel: "widget" | "help";
  poweredBy: boolean;
  hoursNote: string | null;
  embedded?: boolean;
  pageUrl?: string | null;
};

const store = {
  get(k: string, session = false) {
    try {
      return (session ? sessionStorage : localStorage).getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string, session = false) {
    try {
      (session ? sessionStorage : localStorage).setItem(k, v);
    } catch {
      /* storage can be blocked in iframes; the chat still works for this page view */
    }
  },
};

function visitorId() {
  let id = store.get("citedesk_visitor");
  if (!id || !/^[a-z0-9]{16,40}$/.test(id)) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
    store.set("citedesk_visitor", id);
  }
  return id;
}

// The chat window used inside the bubble's iframe and on the hosted help page (FRD F10.3 to F10.5, F11.1).
export function ChatApp(p: ChatAppProps) {
  const convKey = `citedesk_conv_${p.publicId}`;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [ticketSent, setTicketSent] = useState(false);
  const vid = useRef("");
  const conv = useRef<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Escape inside the iframe does not reach the host page, so ask the host to close the chat.
  useEffect(() => {
    if (!p.embedded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") window.parent.postMessage("citedesk:close", "*"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.embedded]);

  useEffect(() => {
    vid.current = visitorId();
    conv.current = store.get(convKey, true);
    input.current?.focus();
  }, [convKey]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy, handoffOpen, ticketSent]);

  async function post(path: string, body: object) {
    const res = await fetch(`/api/chat/${p.publicId}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitorId: vid.current, ...body }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    setError(null);
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const r = await post("", { message: q, conversationId: conv.current, channel: p.channel, pageUrl: p.pageUrl ?? null });
      conv.current = r.conversationId;
      store.set(convKey, r.conversationId, true);
      setMsgs((m) => [...m, { role: "assistant", content: r.answer, id: r.messageId, citations: r.citations, handoff: r.handoff }]);
      if (r.handoff && !ticketSent) setHandoffOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  async function rate(i: number, rating: 1 | -1) {
    const m = msgs[i];
    if (!m.id || m.rating) return;
    setMsgs((all) => all.map((x, j) => (j === i ? { ...x, rating } : x)));
    post("/rate", { messageId: m.id, rating }).catch(() => {});
  }

  return (
    <div className="flex h-full flex-col bg-white text-sm text-slate-900">
      <header className="flex items-center gap-2 px-4 py-3 text-white" style={{ background: p.color }}>
        {p.logo && <img src={p.logo} alt="" className="h-7 w-7 rounded bg-white object-cover" />}
        <h1 className="flex-1 truncate font-semibold">{p.name}</h1>
        {p.embedded && (
          <button onClick={() => window.parent.postMessage("citedesk:close", "*")} aria-label="Close chat" className="rounded p-1 hover:bg-white/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4" role="log" aria-live="polite" aria-label="Chat messages">
        <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm">{p.welcome}</div>
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-tr-sm p-3 text-white" style={{ background: p.color }}>
              <span className="sr-only">You said: </span>{m.content}
            </div>
          ) : (
            <div key={i} className="max-w-[88%] space-y-2 rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm">
              <span className="sr-only">{p.name} said: </span>
              <Markdown text={m.content} />
              {!!m.citations?.length && (
                <div className="border-t border-slate-100 pt-2 text-xs">
                  <span className="text-slate-500">Sources: </span>
                  {m.citations.map((c, j) => (
                    <span key={c.url + j}>
                      {j > 0 && ", "}
                      <a href={c.url} target="_blank" rel="noreferrer" className="underline" style={{ color: p.color }}>{c.title}</a>
                    </span>
                  ))}
                </div>
              )}
              {m.id && (
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  {m.rating ? (
                    <span>Thanks for the feedback.</span>
                  ) : (
                    <>
                      <span>Helpful?</span>
                      <button onClick={() => rate(i, 1)} aria-label="Helpful" className="rounded px-1.5 py-0.5 hover:bg-slate-100">👍</button>
                      <button onClick={() => rate(i, -1)} aria-label="Not helpful" className="rounded px-1.5 py-0.5 hover:bg-slate-100">👎</button>
                    </>
                  )}
                </div>
              )}
            </div>
          ),
        )}
        {busy && <div className="max-w-[88%] rounded-2xl bg-white p-3 text-slate-400 shadow-sm" aria-label="Typing">Typing...</div>}
        {handoffOpen && !ticketSent && (
          <HandoffForm color={p.color} hoursNote={p.hoursNote} onCancel={() => setHandoffOpen(false)} onSend={async (email, name, note) => {
            await post("/ticket", { conversationId: conv.current, email, name, note, channel: p.channel });
            setTicketSent(true);
            setHandoffOpen(false);
          }} />
        )}
        {ticketSent && (
          <div className="max-w-[88%] rounded-2xl bg-green-50 p-3 text-green-900">
            Thanks! A member of our team will reply to you by email. {p.hoursNote}
          </div>
        )}
        <div ref={end} />
      </div>

      {error && <p className="bg-red-50 px-4 py-2 text-red-800" role="alert">{error}</p>}
      <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-3">
        <label htmlFor="citedesk-input" className="sr-only">Your question</label>
        <input id="citedesk-input" ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Ask a question" autoComplete="off" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500" />
        <button disabled={busy || !text.trim()} className="rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50" style={{ background: p.color }}>Send</button>
      </form>
      <div className="flex items-center justify-between px-3 pb-2 text-xs text-slate-500">
        {!ticketSent ? (
          <button onClick={() => setHandoffOpen(true)} className="underline" style={{ color: p.color }}>Talk to a person</button>
        ) : <span />}
        {p.poweredBy && <a href="https://github.com/OluwafemiPaul/citedesk" target="_blank" rel="noreferrer" className="hover:underline">Powered by CiteDesk</a>}
      </div>
    </div>
  );
}

function HandoffForm({ color, hoursNote, onSend, onCancel }: { color: string; hoursNote: string | null; onSend: (email: string, name: string, note: string) => Promise<void>; onCancel: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSend(email, name, note);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not send. Please try again.");
        } finally {
          setBusy(false);
        }
      }}
      className="max-w-[92%] space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
      aria-label="Ask a person for help"
    >
      <p className="font-medium">Want a person to follow up?</p>
      <p className="text-xs text-slate-500">Leave your email and we will send your question and this chat to our team. {hoursNote}</p>
      <label className="block text-xs font-medium">Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal" /></label>
      <label className="block text-xs font-medium">Name (optional)<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal" /></label>
      <label className="block text-xs font-medium">Anything to add? (optional)<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal" /></label>
      {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="rounded-lg px-3 py-1.5 font-medium text-white disabled:opacity-50" style={{ background: color }}>{busy ? "Sending..." : "Send to the team"}</button>
        <button type="button" onClick={onCancel} className="px-2 text-slate-500 underline">Not now</button>
      </div>
    </form>
  );
}
