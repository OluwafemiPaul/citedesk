import { NextResponse } from "next/server";
import { businessFromSession } from "@/lib/bot";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const cell = (v: unknown) => {
  const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  // Quote everything, and stop spreadsheet formula injection from customer text.
  return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
};
const csv = (rows: Record<string, unknown>[], cols: string[]) => [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");

// FRD F12.7: CSV export of conversations (one row per message) or tickets.
export async function GET(req: Request) {
  const ctx = await businessFromSession();
  if (!ctx) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const type = new URL(req.url).searchParams.get("type");
  const admin = supabaseAdmin();
  let body: string;
  if (type === "tickets") {
    const { data } = await admin.from("tickets").select("created_at,status,priority,category,summary,reason,question,visitor_name,visitor_email,email_status,closed_at,transcript").eq("account_id", ctx.account.id).order("created_at", { ascending: false }).limit(5000);
    body = csv(data ?? [], ["created_at", "status", "priority", "category", "summary", "reason", "question", "visitor_name", "visitor_email", "email_status", "closed_at", "transcript"]);
  } else if (type === "conversations") {
    const { data } = await admin.from("messages").select("conversation_id,created_at,role,content,confidence,status,handoff_reason,rating,citations").eq("account_id", ctx.account.id).order("created_at", { ascending: false }).limit(20000);
    body = csv((data ?? []).map((m) => ({ ...m, citations: (m.citations ?? []).map((c: { title: string }) => c.title).join("; ") })), ["conversation_id", "created_at", "role", "content", "confidence", "status", "handoff_reason", "rating", "citations"]);
  } else return NextResponse.json({ error: "Unknown export" }, { status: 400 });
  return new NextResponse("﻿" + body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="citedesk-${type}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}
