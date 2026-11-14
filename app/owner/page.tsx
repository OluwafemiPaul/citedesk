import { formatDateTime } from "@/lib/config";
import { requireOwner } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { currentMonth, EMPTY_USAGE, LIMIT_LABELS, METERED, withDefaults, type Limits, type Usage } from "@/lib/limits";
import { estimateCost, formatUsd } from "@/lib/cost";
import { SiteHeader } from "@/components/SiteHeader";
import { approveRequest, askForInfo, declineRequest, sendTestEmail, setAccountStatus, updateLimits, updateSettings } from "./actions";
import { emailProvider } from "@/lib/email";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner dashboard | CiteDesk" };

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-900",
  paused: "bg-amber-100 text-amber-900",
  pending: "bg-slate-100 text-slate-700",
  declined: "bg-red-100 text-red-900",
  closed: "bg-slate-200 text-slate-700",
  new: "bg-indigo-100 text-indigo-900",
  info_requested: "bg-amber-100 text-amber-900",
};

function Badge({ s }: { s: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s] ?? "bg-slate-100"}`}>{s.replace("_", " ")}</span>;
}

function Meter({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const color = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-indigo-500";
  return (
    <div className="min-w-24">
      <div className="text-xs text-slate-600">
        {Math.round(used)} / {limit}
      </div>
      <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function OwnerPage() {
  const owner = await requireOwner();
  const admin = supabaseAdmin();
  const [{ data: requests }, { data: accounts }, { data: usageRows }, { data: settings }, { data: emails }] = await Promise.all([
    admin.from("access_requests").select("*").in("status", ["new", "info_requested"]).order("created_at", { ascending: false }).limit(100),
    admin.from("accounts").select("*").neq("status", "declined").order("created_at", { ascending: false }),
    admin.from("usage_monthly").select("*").eq("month", currentMonth()),
    admin.from("platform_settings").select("*").eq("id", 1).single(),
    admin.from("email_log").select("id,created_at,kind,to_addresses,subject,body,provider,status,error").order("created_at", { ascending: false }).limit(50),
  ]);
  const failedEmails = (emails ?? []).filter((e) => e.status === "failed").length;
  const provider = emailProvider();

  const usageBy = new Map<string, Usage>((usageRows ?? []).map((u) => [u.account_id, { ...EMPTY_USAGE, ...u }]));
  const rows = (accounts ?? []).map((a) => {
    const usage = usageBy.get(a.id) ?? EMPTY_USAGE;
    return { a, usage, limits: withDefaults(a.limits), cost: estimateCost(usage, settings?.unit_costs) };
  });
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const active = rows.filter((r) => r.a.status === "approved").length;
  const overAlert = settings && totalCost >= Number(settings.cost_alert_usd);

  return (
    <>
      <SiteHeader
        right={
          <form action="/auth/signout" method="post" className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{owner.email} (owner)</span>
            <button className="rounded-md px-3 py-1.5 hover:bg-slate-100">Sign out</button>
          </form>
        }
      />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">Owner dashboard</h1>
          <p className="text-sm text-slate-600">Approve businesses, watch usage and keep costs under control. AI costs are paid by each business&apos;s own key and are not included below.</p>
        </div>

        {overAlert && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            Estimated platform cost this month ({formatUsd(totalCost)}) has passed your alert amount of {formatUsd(Number(settings.cost_alert_usd))}. Consider pausing new requests or lowering limits.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Pending requests", String(requests?.length ?? 0)],
            ["Active businesses", String(active)],
            ["Messages this month", String(rows.reduce((s, r) => s + r.usage.messages, 0))],
            ["Estimated cost this month", formatUsd(totalCost)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-100 px-5 py-3 font-semibold">Requests waiting for review</h2>
          {!requests?.length ? (
            <p className="px-5 py-6 text-sm text-slate-500">No requests waiting.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {requests.map((r) => (
                <li key={r.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {r.business_name} <Badge s={r.status} />
                      </p>
                      <p className="text-sm text-slate-600">
                        {r.contact_name} · {r.email}
                        {r.website && (
                          <>
                            {" · "}
                            <a href={r.website} target="_blank" rel="noreferrer" className="text-indigo-700 underline">{r.website}</a>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.business_type || "Type not given"} · about {r.page_estimate ?? "?"} pages · {formatDateTime(r.created_at)}
                      </p>
                    </div>
                    <form action={approveRequest}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">Approve</button>
                    </form>
                  </div>
                  {r.use_case && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{r.use_case}</p>}
                  {r.review_note && <p className="text-xs text-amber-800">Last note: {r.review_note}</p>}
                  <div className="flex flex-wrap gap-2">
                    <form action={askForInfo} className="flex flex-1 gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <input name="note" required placeholder="Ask a question (emailed to them)" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                      <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Ask</button>
                    </form>
                    <form action={declineRequest} className="flex gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <input name="note" placeholder="Optional reason" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                      <button className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700">Decline</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-100 px-5 py-3 font-semibold">Businesses</h2>
          {!rows.length ? (
            <p className="px-5 py-6 text-sm text-slate-500">No businesses yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2">Business</th>
                  <th className="px-4 py-2">Status</th>
                  {METERED.map((m) => (
                    <th key={m.usage} className="px-4 py-2">{m.label}</th>
                  ))}
                  <th className="px-4 py-2">Est. cost</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {rows.map(({ a, usage, limits, cost }) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-slate-500">{a.contact_email}</p>
                    </td>
                    <td className="px-4 py-3"><Badge s={a.status} /></td>
                    {METERED.map((m) => (
                      <td key={m.usage} className="px-4 py-3">
                        <Meter used={(m.toLimitUnits ?? ((n: number) => n))(usage[m.usage])} limit={limits[m.limit]} />
                      </td>
                    ))}
                    <td className="px-4 py-3">{formatUsd(cost)}</td>
                    <td className="space-y-2 px-4 py-3">
                      <form action={setAccountStatus}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="status" value={a.status === "paused" ? "approved" : "paused"} />
                        <button className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs">{a.status === "paused" ? "Resume" : "Pause"}</button>
                      </form>
                      <details>
                        <summary className="cursor-pointer text-xs text-indigo-700">Edit limits</summary>
                        <form action={updateLimits} className="mt-2 grid w-64 gap-1.5">
                          <input type="hidden" name="id" value={a.id} />
                          {(Object.keys(LIMIT_LABELS) as (keyof Limits)[]).map((k) => (
                            <label key={k} className="flex items-center justify-between gap-2 text-xs">
                              {LIMIT_LABELS[k]}
                              <input name={k} type="number" min={0} defaultValue={limits[k]} className="w-20 rounded border border-slate-300 px-1.5 py-0.5" />
                            </label>
                          ))}
                          <button className="mt-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs text-white">Save limits</button>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Platform switches</h2>
          <form action={updateSettings} className="mt-3 flex flex-wrap items-end gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="requests_paused" defaultChecked={settings?.requests_paused} /> Pause new requests
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="imports_paused" defaultChecked={settings?.imports_paused} /> Pause all website imports
            </label>
            <label className="flex items-center gap-2">
              Cost alert at $
              <input type="number" step="0.5" min={0} name="cost_alert_usd" defaultValue={settings?.cost_alert_usd ?? 10} className="w-20 rounded border border-slate-300 px-2 py-1" />
            </label>
            <button className="rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white">Save</button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Email log</h2>
              <p className="text-xs text-slate-500">
                Sender: {provider === "smtp" ? `Gmail or SMTP (${process.env.SMTP_USER ?? "not set"})` : provider === "resend" ? "Resend" : "none set, emails are only printed to the server log"}
                {failedEmails > 0 && <span className="ml-2 font-medium text-red-700">{failedEmails} failed in the last 50</span>}
              </p>
            </div>
            <form action={sendTestEmail} className="flex items-center gap-2 text-sm">
              <input name="to" type="email" placeholder={owner.email} className="w-56 rounded border border-slate-300 px-2 py-1" />
              <button className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">Send test email</button>
            </form>
          </div>
          {!emails?.length ? (
            <p className="mt-3 text-sm text-slate-500">No emails yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {emails.map((e) => (
                <li key={e.id} className="py-2">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${e.status === "sent" ? "bg-green-50 text-green-800" : e.status === "failed" ? "bg-red-50 text-red-800" : "bg-slate-100 text-slate-600"}`}>{e.status}</span>
                      <span className="text-xs text-slate-500">{formatDateTime(e.created_at)}</span>
                      <span className="text-xs text-slate-500">{e.kind}</span>
                      <span>{e.to_addresses.join(", ")}</span>
                      <span className="text-slate-600">{e.subject}</span>
                    </summary>
                    {e.error && <p className="mt-2 text-xs text-red-700">Reason: {e.error}</p>}
                    <p className="mt-2 text-xs text-slate-500">If this email did not arrive, copy the text below and send it from your own inbox.</p>
                    <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{e.body}</pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
