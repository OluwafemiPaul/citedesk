import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { botByPublicId } from "@/lib/widget";

export const runtime = "nodejs";

// FRD F10.9: helpful or not helpful. Only the visitor who owns the conversation can rate.
export async function POST(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const body = await req.json().catch(() => ({}));
  const rating = body.rating === 1 ? 1 : body.rating === -1 ? -1 : null;
  const messageId = String(body.messageId ?? "");
  const visitorId = String(body.visitorId ?? "");
  if (!rating || !/^[0-9a-f-]{36}$/.test(messageId) || !/^[a-z0-9]{16,40}$/.test(visitorId)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const bot = await botByPublicId(publicId);
  if (!bot) return NextResponse.json({ error: "not found" }, { status: 404 });
  const admin = supabaseAdmin();
  const { data: msg } = await admin.from("messages").select("id, conversations!inner(bot_id,visitor_id)").eq("id", messageId).eq("role", "assistant").maybeSingle();
  const conv = (msg as { conversations?: { bot_id: string; visitor_id: string } } | null)?.conversations;
  if (!msg || conv?.bot_id !== bot.id || conv?.visitor_id !== visitorId) return NextResponse.json({ error: "not found" }, { status: 404 });
  await admin.from("messages").update({ rating }).eq("id", messageId);
  return NextResponse.json({ ok: true });
}
