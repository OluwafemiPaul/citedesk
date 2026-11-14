import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getUsage, METERED, withDefaults } from "@/lib/limits";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your dashboard | CiteDesk" };

// Business owner home. Week 1 shows account status and plan usage;
// the setup wizard, knowledge base and chat settings arrive in Weeks 2 and 3.
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
  const limits = withDefaults(account?.limits);

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

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">Set up your assistant</h2>
          <ol className="mt-3 space-y-2 text-sm">
            {["Connect your AI key", "Import your website or upload documents", "Review your help articles", "Test and customize your bot", "Add the chat to your website"].map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs">{i + 1}</span>
                <span className="text-slate-700">{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">The setup wizard is being built and opens to pilot businesses soon. We will email you when it is ready.</p>
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
