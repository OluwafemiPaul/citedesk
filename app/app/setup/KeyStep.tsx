"use client";

import { useState, useTransition } from "react";
import { removeKey, saveKey, testStoredKey, type KeyResult } from "./actions";
import type { ModelOption, Provider } from "@/lib/providers";

type Saved = { provider: Provider; last4: string; ok: boolean | null; testedAt: string | null; error: string | null } | null;

const GUIDES: Record<Provider, { label: string; steps: string[]; keysUrl: string; limitsUrl: string }> = {
  anthropic: {
    label: "Anthropic (Claude)",
    keysUrl: "https://console.anthropic.com/settings/keys",
    limitsUrl: "https://console.anthropic.com/settings/limits",
    steps: [
      "Sign in or sign up at console.anthropic.com.",
      "Open Billing and add a small amount of credit (for example $5).",
      "Open Limits and set a monthly spend limit you are comfortable with.",
      "Open API keys, click Create key, name it CiteDesk, and copy it.",
      "Paste it below. It starts with sk-ant-.",
    ],
  },
  openai: {
    label: "OpenAI (GPT)",
    keysUrl: "https://platform.openai.com/api-keys",
    limitsUrl: "https://platform.openai.com/settings/organization/limits",
    steps: [
      "Sign in or sign up at platform.openai.com.",
      "Open Billing and add a small amount of credit (for example $5).",
      "Open Limits and set a monthly budget you are comfortable with.",
      "Open API keys, click Create new secret key, name it CiteDesk, and copy it.",
      "Paste it below. It starts with sk-.",
    ],
  },
};

export function KeyStep({ saved, model, paused }: { saved: Saved; model: string | null; paused: boolean }) {
  const [provider, setProvider] = useState<Provider>(saved?.provider ?? "anthropic");
  const [key, setKey] = useState("");
  const [replacing, setReplacing] = useState(!saved);
  const [result, setResult] = useState<KeyResult | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [pending, start] = useTransition();
  const guide = GUIDES[provider];

  const run = (fn: () => Promise<KeyResult>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.models) setModels(r.models);
      if (r.ok) {
        setKey("");
        setReplacing(false);
      }
    });

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        CiteDesk uses your own AI account, so you control the cost and pay the AI provider directly. Most small businesses spend a few dollars a month or less. Your key is encrypted and never shown again in full.
      </p>

      {saved && !replacing && (
        <div className={`rounded-xl border p-4 text-sm ${saved.ok ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
          <p className="font-medium">
            {GUIDES[saved.provider].label} key ending in <span className="font-mono">{saved.last4}</span>
          </p>
          <p className="mt-1 text-slate-600">
            {saved.ok ? "Working" : saved.ok === false ? `Last test failed: ${saved.error}` : "Not tested yet"}
            {saved.testedAt && <> · tested {new Date(saved.testedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</>}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-slate-700">Model</label>
            <select
              defaultValue={model ?? ""}
              onChange={(e) => run(() => testStoredKey(e.target.value))}
              onFocus={() => !models.length && !pending && run(() => testStoredKey())}
              disabled={pending || paused}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1"
            >
              {(models.length ? models : model ? [{ id: model, label: model }] : []).map((m) => (
                <option key={m.id} value={m.id}>{m.label}{m === models[0] ? " (lowest cost)" : ""}</option>
              ))}
            </select>
            <button disabled={pending || paused} onClick={() => run(() => testStoredKey())} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">
              {pending ? "Testing..." : "Test again"}
            </button>
            <button disabled={pending || paused} onClick={() => { setReplacing(true); setResult(null); }} className="rounded-lg px-3 py-1.5 text-slate-600 underline">
              Replace key
            </button>
            <button disabled={pending} onClick={() => start(() => removeKey())} className="rounded-lg px-3 py-1.5 text-red-700 underline">
              Remove
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">The first model listed is the lowest cost option and works well for support answers.</p>
        </div>
      )}

      {replacing && (
        <>
          <div className="flex gap-2">
            {(Object.keys(GUIDES) as Provider[]).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`rounded-xl border px-4 py-2 text-sm ${provider === p ? "border-indigo-600 bg-indigo-50 font-medium text-indigo-900" : "border-slate-300 bg-white"}`}
              >
                {GUIDES[p].label}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <p className="font-medium">How to get a {guide.label} key (about 5 minutes)</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-700">
              {guide.steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
            <p className="mt-2">
              <a href={guide.keysUrl} target="_blank" rel="noreferrer" className="text-indigo-700 underline">Open the API keys page</a>
              {" · "}
              <a href={guide.limitsUrl} target="_blank" rel="noreferrer" className="text-indigo-700 underline">Set a spend limit</a>
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveKey(provider, key));
            }}
            className="space-y-3"
          >
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500"
            />
            <div className="flex items-center gap-3">
              <button disabled={pending || !key.trim() || paused} className="rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50">
                {pending ? "Testing your key..." : "Test and save key"}
              </button>
              {saved && (
                <button type="button" onClick={() => setReplacing(false)} className="text-sm text-slate-600 underline">Cancel</button>
              )}
            </div>
            <p className="text-xs text-slate-500">The test makes one tiny request, which costs a fraction of a cent on your account.</p>
          </form>
        </>
      )}

      {result && (
        <p className={`rounded-lg p-3 text-sm ${result.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-800"}`}>
          {result.ok ? `Your key works. Using model ${result.model}.` : result.error}
        </p>
      )}
    </div>
  );
}
