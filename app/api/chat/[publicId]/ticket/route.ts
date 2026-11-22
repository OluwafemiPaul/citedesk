import { NextResponse } from "next/server";
import { allow } from "@/lib/ratelimit";
import { botByPublicId } from "@/lib/widget";
import { accountFor } from "@/lib/chat";
import { createTicket } from "@/lib/tickets";

export const runtime = "nodejs";

const ip = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

// FRD F11.1: the visitor leaves an email so a person can follow up.
export async function POST(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
  const name = String(body.name ?? "").trim().slice(0, 100) || null;
  const note = String(body.note ?? "").trim().slice(0, 1000) || null;
  const visitorId = String(body.visitorId ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (!/^[a-z0-9]{16,40}$/.test(visitorId)) return NextResponse.json({ error: "Please reload the page." }, { status: 400 });
  if (!allow(`ticket:ip:${ip(req)}`, 10) || !allow(`ticket:v:${visitorId}`, 5)) return NextResponse.json({ error: "Too many requests today. Please email the business directly." }, { status: 429 });

  const bot = await botByPublicId(publicId);
  if (!bot || bot.account_status !== "approved") return NextResponse.json({ error: "This assistant is not available right now." }, { status: 404 });
  const account = await accountFor(bot);
  if (!account) return NextResponse.json({ error: "This assistant is not available right now." }, { status: 404 });

  const res = await createTicket({ bot, account, visitorId, conversationId: typeof body.conversationId === "string" ? body.conversationId : null, email, name, note, channel: body.channel === "help" ? "help" : "widget" });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
