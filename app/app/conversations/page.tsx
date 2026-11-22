import Link from "next/link";
import { requireBusiness } from "@/lib/bot";
import { supabaseAdmin } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/config";
import { BusinessShell } from "@/components/BusinessShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversations | CiteDesk" };

// FRD F12.2: conversations with search.
export default async function Conversations({ searchParams }: { searchParams: Promise<{ q?: string; handoff?: string }> }) {
  const { me, account, bot } = await requireBusiness("/app/conversations");
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100).replace(/[%,()]/g, " ").trim();
  const admin = supabaseAdmin();
  let ids: string[] | null = null;
  if (q) {
    const { data } = await admin.from("messages").select("conversation_id").eq("account_id", account.id).ilike("content", `%${q}%`).limit(500);
    ids = Array.from(new Set((data ?? []).map((m) => m.conversation_id)));
  }
  let query = admin.from("conversations").select("id,channel,handoff,message_count,started_at,last_at,page_url").eq("bot_id", bot.id).order("last_at", { ascending: false }).limit(100);
  if (ids) query = query.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  if (sp.handoff === "1") query = query.eq("handoff", true);
  const { data: convs } = await query;
  const firstQuestions = new Map<string, string>();
  if (convs?.length) {
    const { data: firsts } = await admin.from("messages").select("conversation_id,content,created_at").in("conversation_id", convs.map((c) => c.id)).eq("role", "user").order("created_at").limit(1000);
    for (const m of firsts ?? []) if (!firstQuestions.has(m.conversation_id)) firstQuestions.set(m.conversation_id, m.content);
  }

  return (
    <BusinessShell me={me} wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Conversations</h1>
          <p className="text-sm text-slate-600">Kept for {bot.retention_days} days (change in Setup, step 5). Card and ID numbers are removed before saving.</p>
        </div>
        <a href="/api/export?type=conversations" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">Download CSV</a>
      </div>
      <form className="flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search messages" className="w-64 rounded-lg border border-slate-300 px-3 py-1.5" />
        <label className="flex items-center gap-1"><input type="checkbox" name="handoff" value="1" defaultChecked={sp.handoff === "1"} />Handed off only</label>
        <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5">Filter</button>
      </form>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {!convs?.length ? (
          <p className="p-6 text-sm text-slate-500">No conversations yet. They appear here when customers use your chat bubble or help page.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {convs.map((c) => (
              <li key={c.id}>
                <Link href={`/app/conversations/${c.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-slate-50">
                  <span className="min-w-0 flex-1 truncate font-medium">{firstQuestions.get(c.id) ?? "(no question)"}</span>
                  {c.handoff && <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">handed off</span>}
                  <span className="text-xs text-slate-500">{c.channel === "help" ? "help page" : "website"} · {c.message_count} messages · {formatDateTime(c.last_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BusinessShell>
  );
}
