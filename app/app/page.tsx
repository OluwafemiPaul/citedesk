import { formatDateTime } from "@/lib/config";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getUsage, METERED, withDefaults } from "@/lib/limits";
import { SiteHeader } from "@/components/SiteHeader";
import { BusinessShell } from "@/components/BusinessShell";
import { getOrCreateBot } from "@/lib/bot";
import { getProgress, STEPS } from "@/lib/setup";
import { dashboardStats } from "@/lib/stats";
import { storageUsed } from "@/lib/articles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your dashboard | CiteDesk" };

function Card({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const inner = (
    <>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </>
  );
  return href ? <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-indigo-300">{inner}</Link> : <div className="rounded-2xl border border-slate-200 bg-white p-4">{inner}</div>;
}

// Business owner home (FRD F12.1, F12.4 to F12.6): results, gaps, setup progress and plan usage.
export default async function BusinessHome() {
  const me = await requireUser();

  if (!me.account_id) {
    const header = (
      <form action="/auth/signout" method="post" className="flex items-center gap-3">
        {me.role === "platform_owner" && <Link href="/owner" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Owner dashboard</Link>}
        <span className="text-xs text-slate-500">{me.email}</span>
        <button className="rounded-md px-3 py-1.5 hover:bg-slate-100">Sign out</button>
      </form>
    );
    return (
      <>
        <SiteHeader right={header} />
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-xl font-semibold">{me.role === "platform_owner" ? "You are the platform owner" : "No business linked to this email yet"}</h1>
          <p className="mt-2 text-slate-600">
            {me.role === "platform_owner" ? (
              <>Go to the <Link href="/owner" className="text-indigo-700 underline">owner dashboard</Link> to review requests.</>
            ) : (
              <>If you requested access, you will get an email once approved. <Link href="/request-access" className="text-indigo-700 underline">Request access</Link></>
            )}
          </p>
        </main>
      </>
    );
  }

  const admin = supabaseAdmin();
  const { data: account } = await admin.from("accounts").select("*").eq("id", me.account_id).single();
  const active = account && ["approved", "paused"].includes(account.status);
  const limits = withDefaults(account?.limits);
  const [usage, { data: notices }, bot] = await Promise.all([
    getUsage(me.account_id),
    admin.from("notices").select("id,created_at,title,body").eq("account_id", me.account_id).order("created_at", { ascending: false }).limit(5),
    active ? getOrCreateBot(account.id, account.name) : Promise.resolve(null),
  ]);
  const [progress, stats, storage] = bot ? await Promise.all([getProgress(bot), dashboardStats(account.id), storageUsed(account.id)]) : [null, null, 0];

  const meters = [
    ...METERED.filter((m) => m.usage !== "storage_bytes").map((m) => ({ label: m.label, used: usage[m.usage], limit: limits[m.limit] as number })),
    { label: "Storage (MB)", used: Math.round((storage / 1024 / 1024) * 100) / 100, limit: limits.storage_mb },
  ];

  return (
    <BusinessShell me={me}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{account?.name ?? "Your business"}</h1>
          <p className="text-sm text-slate-600">Plan: {account?.plan ?? "free"} pilot · Status: {account?.status}</p>
        </div>
        {bot?.slug && <a href={`/help/${bot.slug}`} target="_blank" rel="noreferrer" className="text-sm text-indigo-700 underline">Open my help page</a>}
      </div>

      {account?.status === "paused" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Your account is paused, so your assistant shows an offline message. Your data is safe. Reply to any CiteDesk email to resolve this.
        </div>
      )}

      {stats && (
        <section className="space-y-3">
          <h2 className="font-semibold">Last 30 days</h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Card label="Questions answered or handed off" value={String(stats.questions)} sub={`${stats.conversations} conversations`} href="/app/conversations" />
            <Card label="Resolved by your assistant" value={`${stats.resolvedPct}%`} sub={`${stats.resolved} questions`} />
            <Card label="Handed to your team" value={`${stats.handedOffPct}%`} sub={`${stats.openTickets} open tickets`} href="/app/tickets" />
            <Card label="Help center gaps" value={String(stats.gaps.length)} sub="questions with no good answer" href="/app/gaps" />
          </div>
          {(stats.helpful > 0 || stats.notHelpful > 0) && <p className="text-xs text-slate-500">Customer ratings: {stats.helpful} helpful, {stats.notHelpful} not helpful.</p>}
        </section>
      )}

      {stats && (stats.gaps.length > 0 || stats.topArticles.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Top gaps</h2><Link href="/app/gaps" className="text-sm text-indigo-700 underline">See all</Link></div>
            {stats.gaps.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {stats.gaps.slice(0, 5).map((g) => (
                  <li key={g.key} className="flex justify-between gap-3"><span className="truncate">{g.example}</span><span className="shrink-0 text-slate-500">{g.count}x</span></li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-slate-500">No gaps. Nice.</p>}
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Most used articles</h2>
            {stats.topArticles.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {stats.topArticles.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3"><Link href={`/app/articles/${a.id}`} className="truncate hover:underline">{a.title}</Link><span className="shrink-0 text-slate-500">{a.count}x</span></li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-slate-500">None yet.</p>}
          </section>
        </div>
      )}

      {progress && progress.completed < 6 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Set up your assistant</h2>
              <p className="text-sm text-slate-600">{progress.completed} of 6 steps done</p>
            </div>
            <Link href="/app/setup" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white">{progress.completed ? "Continue setup" : "Start setup"}</Link>
          </div>
          <ol className="mt-4 grid gap-2 text-sm md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex items-center gap-2">
                <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${progress.done[s.n] ? "bg-green-100 text-green-800" : "bg-slate-100"}`}>{progress.done[s.n] ? "✓" : s.n}</span>
                <Link href={`/app/setup?step=${s.n}`} className="text-slate-700 hover:underline">{s.title}</Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {!!notices?.length && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">Notices</h2>
          <p className="text-xs text-slate-500">Everything we email you also appears here, in case an email goes to spam.</p>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {notices.map((n) => (
              <li key={n.id} className="py-2">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{n.title}</span>
                  <span className="shrink-0 text-xs text-slate-500">{formatDateTime(n.created_at, false)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-slate-600">{n.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold">This month&apos;s usage</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {meters.map((m) => {
            const pct = Math.min(100, Math.round((m.used / Math.max(m.limit, 1)) * 100));
            return (
              <div key={m.label}>
                <div className="flex justify-between text-sm">
                  <span>{m.label}</span>
                  <span className={pct >= 80 ? "font-medium text-amber-700" : "text-slate-500"}>{m.used} of {m.limit}{pct >= 100 ? " (limit reached)" : pct >= 80 ? " (almost at the limit)" : ""}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-indigo-500"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </BusinessShell>
  );
}
