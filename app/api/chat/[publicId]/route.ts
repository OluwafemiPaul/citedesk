import { NextResponse } from "next/server";
import { allow } from "@/lib/ratelimit";
import { botByPublicId, isLive } from "@/lib/widget";
import { accountFor, chat } from "@/lib/chat";

export const runtime = "nodejs";
export const maxDuration = 60;

const ip = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

// Public chat endpoint used by the chat bubble and the help page (same origin as this server).
export async function POST(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const body = await req.json().catch(() => ({}));
  const message = String(body.message ?? "").trim();
  const visitorId = String(body.visitorId ?? "");
  if (!message) return NextResponse.json({ error: "Type a question." }, { status: 400 });
  if (message.length > 1000) return NextResponse.json({ error: "Please keep your message under 1,000 characters." }, { status: 400 });
  if (!/^[a-z0-9]{16,40}$/.test(visitorId)) return NextResponse.json({ error: "Please reload the page." }, { status: 400 });

  // Protects each business's own AI key from abuse: per visitor and per network limits.
  if (!allow(`chat:ip:${ip(req)}`, 60) || !allow(`chat:v:${visitorId}`, 40)) {
    return NextResponse.json({ error: "Too many messages. Please wait a while, or use Talk to a person." }, { status: 429 });
  }

  const bot = await botByPublicId(publicId);
  if (!bot || !isLive(bot)) return NextResponse.json({ error: "This assistant is not available right now." }, { status: 404 });
  const account = await accountFor(bot);
  if (!account) return NextResponse.json({ error: "This assistant is not available right now." }, { status: 404 });

  const channel = body.channel === "help" ? "help" : "widget";
  const res = await chat({ bot, account, visitorId, conversationId: typeof body.conversationId === "string" ? body.conversationId : null, message, channel, pageUrl: typeof body.pageUrl === "string" ? body.pageUrl : null });
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res);
}
