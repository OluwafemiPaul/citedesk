"use client";

import { useState } from "react";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, next }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <p className="mt-5 rounded-lg bg-indigo-50 p-4 text-sm text-indigo-900">
        If <strong>{email}</strong> has access, a sign in link is on its way. It expires in 1 hour. Check your spam folder if you do not see it.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@yourbusiness.com"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={state === "sending"} className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-medium text-white disabled:opacity-50">
        {state === "sending" ? "Sending..." : "Email me a sign in link"}
      </button>
    </form>
  );
}
