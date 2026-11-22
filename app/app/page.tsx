import { formatDateTime } from "@/lib/config";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getUsage, METERED, withDefaults } from "@/lib/limits";
import { SiteHeader } from "@/components/SiteHeader";
import { getOrCreateBot } from "@/lib/bot";
import { getProgress, STEPS } from "@/lib/setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your dashboard | CiteDesk" };

// Business owner home. Week 1 shows account status and plan usage;
// links into the setup wizard (Week 2).
export default async function BusinessHome() {
  const me = await requireUser();
  const header = (
    <form action="/auth/signout" method="post" className="flex items-center gap-3">
      {me.role === "platform_owner" && <Link href="/owner" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Owner dashboard</Link>}
      <span className="text-xs text-slate-500">{me.email}</span>
      <button className="rounded-md px-3 py-1.5 hover:bg-slate-100">Sign out</button>
    </form>
  );

  if (!me.account_id) {
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

  const { data: account } = await supabaseAdmin().from("accounts").select("*").eq("id", me.account_id).single();
  const usage = await getUsage(me.account_id);
  const { data: notices } = await supabaseAdmin()
    .from("notices")
    .select("id,created_at,title,body")
    .eq("account_id", me.account_id)
    .order("created_at", { ascending: false })
    .limit(10);
  const limits = withDefaults(account?.limits);
  const progress = account && ["approved", "paused"].includes(account.status) ? await getProgress(await getOrCreateBot(account.id, account.name)) : null;

  return (
    <>
      <SiteHeader right={header} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">{account?.name ?? "Your business"}</h1>
          <p className="text-sm text-slate-600">Plan: {account?.plan ?? "free"} pilot · Status: {account?.status}</p>
        </div>

        {account?.status === "paused" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Your account is paused, so your bot shows an offline message. Your data is safe. Reply to any CiteDesk email to resolve this.
          </div>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Set up your assistant</h2>
              <p className="text-sm text-slate-600">{progress ? `${progress.completed} of 6 steps done` : "Not started"}</p>
            </div>
            <Link href="/app/setup" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white">{progress?.completed ? "Continue setup" : "Start setup"}</Link>
          </div>
          <ol className="mt-4 grid gap-2 text-sm md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex items-center gap-2">
                <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${progress?.done[s.n] ? "bg-green-100 text-green-800" : "bg-slate-100"}`}>{progress?.done[s.n] ? "✓" : s.n}</span>
                <Link href={`/app/setup?step=${s.n}`} className="text-slate-700 hover:underline">{s.title}</Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">This month&apos;s usage</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {METERED.map((m) => {
              const used = (m.toLimitUnits ?? ((n: number) => n))(usage[m.usage]);
              const limit = limits[m.limit];
              const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
              return (
                <div key={m.usage}>
                  <div className="flex justify-between text-sm">
                    <span>{m.label}</span>
                    <span className="text-slate-500">{Math.round(used)} of {limit}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100">
                    <div className={`h-2 rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-indigo-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
