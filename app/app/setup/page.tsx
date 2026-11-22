import Link from "next/link";
import { canUseResources, requireBusiness } from "@/lib/bot";
import { getProgress, STEPS } from "@/lib/setup";
import { BusinessShell } from "@/components/BusinessShell";
import { KeyStep } from "./KeyStep";
import { PreviewChat } from "./PreviewChat";
import { setSetupStep } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup | CiteDesk" };

// Setup wizard (FRD F6.1): progress bar, any step can be opened, progress is saved.
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { me, account, bot } = await requireBusiness("/app/setup");
  const progress = await getProgress(bot);
  const { step: stepParam } = await searchParams;
  const firstOpen = STEPS.find((s) => !progress.done[s.n])?.n ?? 6;
  const step = Math.min(6, Math.max(1, Number(stepParam) || firstOpen));
  const paused = !canUseResources(account);
  const current = STEPS[step - 1];

  return (
    <BusinessShell me={me}>
      <div>
        <h1 className="text-2xl font-semibold">Set up your assistant</h1>
        <p className="text-sm text-slate-600">{progress.completed} of 6 steps done. You can leave and come back any time; your progress is saved.</p>
      </div>

      {paused && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Your account is paused, so imports and AI features are turned off for now.</div>
      )}

      <ol className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {STEPS.map((s) => (
          <li key={s.n}>
            <Link
              href={`/app/setup?step=${s.n}`}
              className={`block rounded-xl border p-2 text-xs ${s.n === step ? "border-indigo-600 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
            >
              <span className={`mb-1 block h-1.5 rounded-full ${progress.done[s.n] ? "bg-green-500" : s.n === step ? "bg-indigo-500" : "bg-slate-200"}`} />
              <span className="font-medium">{s.n}. {s.short}</span>
              {progress.done[s.n] && <span className="ml-1 text-green-700">✓</span>}
            </Link>
          </li>
        ))}
      </ol>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">{current.n}. {current.title}</h2>

        {step === 1 && (
          <KeyStep
            paused={paused}
            model={bot.model}
            saved={progress.key ? { provider: progress.key.provider, last4: progress.key.last4, ok: progress.key.last_test_ok, testedAt: progress.key.last_tested_at, error: progress.key.last_error } : null}
          />
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Your assistant only answers from what you add here. Pick one or more ways; you can add more later.</p>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                { href: "/app/import", title: "Import your website", text: "We read your pages and turn each one into a draft article. Best place to start." },
                { href: "/app/articles/upload", title: "Upload PDF or Word files", text: "Menus, price lists, policies, FAQs. Split into articles by heading." },
                { href: "/app/articles/new", title: "Write or paste text", text: "Anything not on your website, like opening hours or delivery rules." },
              ].map((c) => (
                <Link key={c.href} href={c.href} className="rounded-xl border border-slate-200 p-4 hover:border-indigo-400 hover:bg-indigo-50/40">
                  <p className="font-medium">{c.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{c.text}</p>
                </Link>
              ))}
            </div>
            <p className="text-sm text-slate-600">You have <strong>{progress.total}</strong> article{progress.total === 1 ? "" : "s"} so far.</p>
            {progress.total > 0 && <Link href="/app/setup?step=3" className="inline-block rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Next: review articles</Link>}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">New articles start as drafts. Your assistant only uses approved articles, so read them, fix anything wrong, and approve them.</p>
            <p><strong>{progress.approved}</strong> approved out of <strong>{progress.total}</strong>.</p>
            <div className="flex gap-2">
              <Link href="/app/articles?status=draft" className="rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white">Review drafts</Link>
              {progress.approved > 0 && <Link href="/app/setup?step=4" className="rounded-xl border border-slate-300 px-4 py-2">Next: test your assistant</Link>}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Ask the questions your customers ask. Answers come from your approved articles with sources, using your own AI key. Each question counts toward your monthly message limit.</p>
            {!progress.done[1] ? (
              <p className="text-sm text-amber-800">Connect a working AI key first (step 1).</p>
            ) : progress.approved === 0 ? (
              <p className="text-sm text-amber-800">Approve at least one article first (step 3).</p>
            ) : (
              <PreviewChat botName={bot.name} welcome={bot.welcome_message} color={bot.brand_color} />
            )}
            {progress.done[1] && progress.approved > 0 && !progress.done[4] && (
              <form action={async () => { "use server"; await setSetupStep(5); }}>
                <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Answers look good: mark this step done</button>
              </form>
            )}
          </div>
        )}

        {step >= 5 && (
          <p className="text-sm text-slate-600">
            {step === 5 ? "Name, welcome message, colors, logo and handoff email" : "The one line install code and guides for Wix, Squarespace, Shopify, WordPress and Webflow"} arrive in the next update. Everything you set up so far is saved.
          </p>
        )}
      </section>
    </BusinessShell>
  );
}
