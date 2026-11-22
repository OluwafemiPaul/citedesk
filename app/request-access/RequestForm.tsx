"use client";

import Script from "next/script";
import { useState } from "react";

const TYPES = ["Shop or ecommerce", "Clinic or health practice", "Church or nonprofit", "Restaurant or food", "Service business", "Software or startup", "Other"];
const PAGES = ["Under 20", "20 to 50", "50 to 200", "Over 200"];

export function RequestForm({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setState("sending");
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const res = await fetch("/api/request-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setApproved(Boolean(data.approved));
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("idle");
      // A failed bot check token cannot be reused.
      (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
    }
  }

  if (state === "done" && approved) {
    return (
      <div className="text-center">
        <p className="text-lg font-medium">You are approved.</p>
        <p className="mt-2 text-sm text-slate-600">We emailed you too. <a href="/login" className="text-indigo-700 underline">Sign in</a> with this email address to set up your assistant.</p>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="text-center">
        <p className="text-lg font-medium">Thanks, your request is in.</p>
        <p className="mt-2 text-sm text-slate-600">We sent a confirmation to your email. You will hear from us after review, usually within 2 business days.</p>
      </div>
    );
  }

  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500";
  return (
    <form onSubmit={submit} className="space-y-4">
      {turnstileSiteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          Business name *<input name="business_name" required maxLength={120} className={input} />
        </label>
        <label className="block text-sm">
          Your name *<input name="contact_name" required maxLength={120} className={input} />
        </label>
        <label className="block text-sm">
          Email *<input name="email" type="email" required maxLength={200} className={input} />
        </label>
        <label className="block text-sm">
          Website<input name="website" type="url" placeholder="https://yourbusiness.com" maxLength={300} className={input} />
        </label>
        <label className="block text-sm">
          Type of business
          <select name="business_type" className={input} defaultValue="">
            <option value="" disabled>Choose one</option>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          About how many pages is your site?
          <select name="page_estimate" className={input} defaultValue="">
            <option value="" disabled>Choose one</option>
            {PAGES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        What questions do customers ask you most?
        <textarea name="use_case" rows={3} maxLength={1000} className={input} placeholder="For example: opening hours, prices, booking, returns" />
      </label>
      {/* Hidden field that only bots fill in. */}
      <input name="company_fax" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {turnstileSiteKey && <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={state === "sending"} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-medium text-white disabled:opacity-50">
        {state === "sending" ? "Sending..." : "Request access"}
      </button>
      <p className="text-xs text-slate-500">By submitting, you agree to our terms and privacy policy. We only use your details to review your request and contact you about CiteDesk.</p>
    </form>
  );
}
