import { NextResponse } from "next/server";
import { loadArticles } from "@/lib/kb";
import { search } from "@/lib/retrieval";
import { checkHandoff, redactSensitive } from "@/lib/policy";
import { askClaude } from "@/lib/agent";
import { retrievalOnlyAnswer, savedAnswer } from "@/lib/demo";
import { allow } from "@/lib/ratelimit";
import type { ChatMessage, ChatResponse } from "@/lib/types";

export const runtime = "nodejs";

const MAX_CHARS = 1500;
const MIN_DEMO_SCORE = 2.5;

export async function POST(req: Request) {
  let body: { question?: string; history?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const rawQuestion = (body.question ?? "").toString().trim();
  if (!rawQuestion) return NextResponse.json({ error: "Please type a question." }, { status: 400 });
  if (rawQuestion.length > MAX_CHARS) {
    return NextResponse.json({ error: `Please keep questions under ${MAX_CHARS} characters.` }, { status: 400 });
  }

  // 1. Remove card numbers and ID numbers before anything else sees them.
  const { text: question, redacted } = redactSensitive(rawQuestion);
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: redactSensitive(m.content.slice(0, MAX_CHARS)).text }));

  // 2. Find the most relevant help articles.
  const articles = loadArticles();
  const scored = search(question.replace(/\[(card|ID) number removed\]/g, ""), articles, 4);
  const hits = scored.map((h) => h.article);
  // Weak keyword matches are not trusted for demo answers; they go to a human instead.
  const strongHits = scored.filter((h) => h.score >= MIN_DEMO_SCORE).map((h) => h.article);

  // 3. Hard rules that always trigger a human handoff.
  const rule = checkHandoff(question);

  const userKey = req.headers.get("x-user-api-key")?.trim();
  const serverKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-5-5";
  const limit = Number(process.env.DAILY_LIMIT_PER_IP ?? 20);
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();

  let result: Omit<ChatResponse, "mode"> | null = null;
  let mode: ChatResponse["mode"] = "demo";
  let notice: string | undefined;

  const saved = savedAnswer(question);
  const apiKey = userKey || serverKey;

  if (apiKey && (userKey || allow(ip, limit))) {
    try {
      result = await askClaude({ apiKey, model, history, question, articles: hits });
      mode = "live";
    } catch (err) {
      console.error("Claude request failed:", err instanceof Error ? err.message : err);
      notice = "The live AI is unavailable right now, so this is a demo mode answer.";
    }
  } else if (apiKey) {
    notice = "You reached today's free limit on the shared demo key. Add your own API key in Settings for unlimited questions.";
  } else {
    notice = "Demo mode: no API key is set, so answers come from saved examples and simple search.";
  }

  if (!result) result = saved ?? retrievalOnlyAnswer(question, strongHits);

  // 4. Rules win over the model: if a rule fired, always hand off.
  if (rule && !result.handoff) {
    result = {
      ...result,
      handoff: true,
      handoffReason: rule.reason,
      answer: `${result.answer}\n\nI am also connecting you with a human agent who can help with this.`,
      ticket: { summary: rule.reason, category: rule.category, priority: rule.priority, customerQuestion: question },
    };
  }

  const response: ChatResponse = { ...result, mode, notice, redacted };
  return NextResponse.json(response);
}
