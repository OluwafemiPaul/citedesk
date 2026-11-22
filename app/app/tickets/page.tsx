import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/bot";
import { supabaseAdmin } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/config";
import { BusinessShell } from "@/components/BusinessShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tickets | CiteDesk" };

async function setStatus(form: FormData) {
  "use server";
  const { account } = await requireBusiness("/app/tickets");
  const status = form.get("status") === "closed" ? "closed" : "open";
  await supabaseAdmin().from("tickets").update({ status, closed_at: status === "closed" ? new Date().toISOString() : null }).eq("id", String(form.get("id"))).eq("account_id", account.id);
  revalidatePath("/app/tickets");
}

const PRIORITY = { urgent: "bg-red-100 text-red-800", high: "bg-amber-100 text-amber-800", normal: "bg-slate-100 text-slate-700", low: "bg-slate-50 text-slate-500" } as const;
const EMAIL = { sent: "emailed", failed: "email failed", over_limit: "not emailed (limit reached)" } as Record<string, string>;

// FRD F12.3: tickets with status, priority and reason; mark open or closed.
export default async function Tickets({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { me, account, bot } = await requireBusiness("/app/tickets");
  const status = (await searchParams).status === "closed" ? "closed" : "open";
  const { data: tickets } = await supabaseAdmin().from("tickets").select("*").eq("account_id", account.id).eq("status", status).order("created_at", { ascending: false }).limit(200);
  return (
    <BusinessShell me={me} wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tickets</h1>
          <p className="text-sm text-slate-600">Questions your assistant handed to your team. Each is emailed to {bot.handoff_email ?? account.contact_email}; reply to the email to answer the customer.</p>
        </div>
        <a href="/api/export?type=tickets" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">Download CSV</a>
      </div>
      <div className="flex gap-2 text-sm">
        {(["open", "closed"] as const).map((s) => (
          <Link key={s} href={`/app/tickets?status=${s}`} className={`rounded-full px-3 py-1 ${status === s ? "bg-indigo-600 text-white" : "bg-white ring-1 ring-slate-200"}`}>{s === "open" ? "Open" : "Closed"}</Link>
        ))}
      </div>
      {!tickets?.length ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No {status} tickets.</p>
      ) : (
        <ul className="space-y-3">
          {tickets.map((t) => (
            <li key={t.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${PRIORITY[t.priority as keyof typeof PRIORITY]}`}>{t.priority}</span>
                <span className="font-medium">{t.summary}</span>
                <span className="ml-auto text-xs text-slate-500">{formatDateTime(t.created_at)} · {EMAIL[t.email_status ?? ""] ?? "saved"}</span>
              </div>
              <p className="mt-2 text-slate-600"><strong>Customer:</strong> {t.visitor_name ? `${t.visitor_name}, ` : ""}<a href={`mailto:${t.visitor_email}?subject=${encodeURIComponent("Re: " + t.summary)}`} className="text-indigo-700 underline">{t.visitor_email}</a></p>
              <p className="text-slate-600"><strong>Question:</strong> {t.question}</p>
              <p className="text-slate-500"><strong>Why handed off:</strong> {t.reason} · {t.category}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-slate-600">Conversation</summary>
                <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs">{t.transcript}</pre>
              </details>
              <form action={setStatus} className="mt-3">
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="status" value={t.status === "open" ? "closed" : "open"} />
                <button className="rounded-lg border border-slate-300 px-3 py-1.5">{t.status === "open" ? "Mark closed" : "Reopen"}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </BusinessShell>
  );
}
