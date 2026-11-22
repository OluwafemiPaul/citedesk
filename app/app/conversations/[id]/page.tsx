import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/bot";
import { supabaseAdmin } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/config";
import { Markdown } from "@/lib/markdown";
import { BusinessShell } from "@/components/BusinessShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversation | CiteDesk" };

// FRD F12.2: full transcript with sources and what only the owner sees (confidence, handoff reason, rating).
export default async function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const { me, bot } = await requireBusiness("/app/conversations");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const admin = supabaseAdmin();
  const { data: c } = await admin.from("conversations").select("*").eq("id", id).eq("bot_id", bot.id).maybeSingle();
  if (!c) notFound();
  const [{ data: msgs }, { data: ticket }] = await Promise.all([
    admin.from("messages").select("*").eq("conversation_id", id).order("created_at"),
    admin.from("tickets").select("id,status,visitor_email").eq("conversation_id", id).maybeSingle(),
  ]);
  return (
    <BusinessShell me={me}>
      <Link href="/app/conversations" className="text-sm text-indigo-700 underline">Back to conversations</Link>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Started {formatDateTime(c.started_at)} on your {c.channel === "help" ? "help page" : "website"}{c.page_url && <> at <span className="break-all">{c.page_url}</span></>}.
        {ticket && <> Ticket: <Link href="/app/tickets" className="text-indigo-700 underline">{ticket.status}</Link> ({ticket.visitor_email}).</>}
      </div>
      <div className="space-y-3">
        {(msgs ?? []).map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-indigo-600 p-3 text-sm text-white">{m.content}</div>
          ) : (
            <div key={m.id} className="max-w-[85%] space-y-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm">
              <Markdown text={m.content} />
              {!!m.citations?.length && <p className="text-xs text-slate-500">Sources: {m.citations.map((x: { title: string }) => x.title).join(", ")}</p>}
              <p className="rounded bg-slate-50 p-2 text-xs text-slate-500">
                {m.status === "answered" ? "Answered" : m.status === "unavailable" ? "Assistant unavailable" : "Handed off"}
                {m.confidence && ` · confidence ${m.confidence}`}
                {m.handoff_reason && ` · ${m.handoff_reason}`}
                {m.rating === 1 && " · rated helpful"}
                {m.rating === -1 && " · rated not helpful"}
              </p>
            </div>
          ),
        )}
      </div>
    </BusinessShell>
  );
}
