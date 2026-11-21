"use client";

import { useState } from "react";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500";
const button = "w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-medium text-white disabled:opacity-50";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "verifying">("idle");
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function post(url: string, body: object) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }

  async function sendLink(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setState("sending");
    try {
      await post("/api/auth/login", { email, next });
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("idle");
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("verifying");
    try {
      const data = await post("/api/auth/verify", { email, code, next });
      window.location.assign(data.next || "/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("sent");
    }
  }

  if (state === "sent" || state === "verifying") {
    return (
      <div className="mt-5 space-y-4">
        <p className="rounded-lg bg-indigo-50 p-4 text-sm text-indigo-900">
          If <strong>{email}</strong> has access, an email is on its way with a sign in link and a code. Both expire in 1 hour. Check your spam folder if you do not see it.
        </p>
        <form onSubmit={verify} className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Enter the code from the email
            <span className="block text-xs font-normal text-slate-500">Works on any device or browser, so use it if the link opens somewhere else.</span>
          </label>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="123456"
            className={`${input} text-center text-lg tracking-[0.4em]`}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={state === "verifying" || code.length < 6} className={button}>
            {state === "verifying" ? "Signing in..." : "Sign in with code"}
          </button>
        </form>
        <div className="flex justify-between text-sm">
          <button type="button" onClick={() => { setState("idle"); setCode(""); setError(null); }} className="text-slate-600 underline">
            Use a different email
          </button>
          <button type="button" disabled={resent} onClick={() => { setResent(true); setCode(""); sendLink(); }} className="text-indigo-700 underline disabled:text-slate-400 disabled:no-underline">
            {resent ? "New email sent" : "Send a new email"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={sendLink} className="mt-5 space-y-3">
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.com" className={input} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={state === "sending"} className={button}>
        {state === "sending" ? "Sending..." : "Email me a sign in code"}
      </button>
    </form>
  );
}
