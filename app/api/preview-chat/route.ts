import { NextResponse } from "next/server";
import { businessFromSession, canUseResources } from "@/lib/bot";
import { answerQuestion } from "@/lib/engine";
import { allow } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Preview chat in the setup wizard (FRD F6.6): the real engine, signed in owners only.
export async function POST(req: Request) {
  const ctx = await businessFromSession();
  if (!ctx) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!canUseResources(ctx.account)) return NextResponse.json({ error: "Your account is paused." }, { status: 403 });
  if (!allow(`preview:${ctx.account.id}`, 200)) return NextResponse.json({ error: "Too many test questions today." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim();
  if (!question) return NextResponse.json({ error: "Type a question." }, { status: 400 });
  if (question.length > 1500) return NextResponse.json({ error: "Please keep questions under 1,500 characters." }, { status: 400 });
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((m: { role?: string; content?: unknown }) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-6);
  const reply = await answerQuestion({ account: ctx.account, bot: ctx.bot, question, history });
  return NextResponse.json(reply);
}
