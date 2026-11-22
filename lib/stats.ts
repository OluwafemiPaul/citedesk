import { supabaseAdmin } from "@/lib/supabase/server";

type Row = { status: string | null; confidence: string | null; citations: { id: string; title: string }[] | null; question: string | null; handoff_reason: string | null; rating: number | null; created_at: string };

export type Gap = { key: string; example: string; count: number; last: string };

// A gap is a question the assistant could not answer from the articles (FRD F12.4).
const isGap = (r: Row) => r.status !== "answered" && (r.handoff_reason === "No matching information found" || r.confidence === "low" || !(r.citations?.length));

function gapKey(q: string) {
  return q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).sort().slice(0, 6).join(" ");
}
const STOP = new Set(["the", "you", "your", "and", "for", "are", "can", "what", "when", "how", "does", "have", "with", "there", "this", "that", "will", "any", "about", "from", "please", "hello", "thanks", "need", "want", "would", "could", "get"]);

// Summary for the business dashboard: last 30 days (FRD F12.1, F12.4, F12.5).
export async function dashboardStats(accountId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const admin = supabaseAdmin();
  const [{ data }, { count: conversations }, { count: openTickets }] = await Promise.all([
    admin.from("messages").select("status,confidence,citations,question,handoff_reason,rating,created_at").eq("account_id", accountId).eq("role", "assistant").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
    admin.from("conversations").select("id", { count: "exact", head: true }).eq("account_id", accountId).gte("started_at", since),
    admin.from("tickets").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "open"),
  ]);
  const rows = (data ?? []) as Row[];
  const questions = rows.length;
  const resolved = rows.filter((r) => r.status === "answered").length;
  const handedOff = questions - resolved;
  const helpful = rows.filter((r) => r.rating === 1).length;
  const notHelpful = rows.filter((r) => r.rating === -1).length;

  const gapsMap = new Map<string, Gap>();
  for (const r of rows.filter(isGap)) {
    const q = (r.question ?? "").trim();
    if (!q) continue;
    const key = gapKey(q) || q.toLowerCase().slice(0, 40);
    const g = gapsMap.get(key);
    if (g) g.count++;
    else gapsMap.set(key, { key, example: q.slice(0, 200), count: 1, last: r.created_at });
  }
  const gaps = Array.from(gapsMap.values()).sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));

  const used = new Map<string, { id: string; title: string; count: number }>();
  for (const r of rows) for (const c of r.citations ?? []) {
    const u = used.get(c.id);
    if (u) u.count++;
    else used.set(c.id, { id: c.id, title: c.title, count: 1 });
  }
  const topArticles = Array.from(used.values()).sort((a, b) => b.count - a.count).slice(0, 8);

  const pct = (n: number) => (questions ? Math.round((n / questions) * 100) : 0);
  return { questions, conversations: conversations ?? 0, resolved, resolvedPct: pct(resolved), handedOff, handedOffPct: pct(handedOff), gaps, topArticles, openTickets: openTickets ?? 0, helpful, notHelpful };
}
