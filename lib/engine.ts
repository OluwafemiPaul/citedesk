// The CiteDesk answer engine (FRD F9). Answers only from a business's approved articles,
// cites them, and hands off when a rule fires, nothing matches, or confidence is low.
// Same design as the tested prototype, with the business's own key and Postgres search.

import { supabaseAdmin } from "@/lib/supabase/server";
import { checkLimit, recordUsage } from "@/lib/limits";
import { getApiKey, type Account, type Bot } from "@/lib/bot";
import { structuredCall, ProviderError, type Turn } from "@/lib/providers";
import { redactSensitive } from "@/lib/policy";

export type EngineCitation = { id: string; title: string; url: string | null };
export type EngineTicket = { summary: string; category: string; priority: "low" | "normal" | "high" | "urgent"; customerQuestion: string };
export type EngineReply = {
  answer: string;
  citations: EngineCitation[];
  confidence: "high" | "medium" | "low";
  handoff: boolean;
  handoffReason?: string;
  ticket?: EngineTicket;
  redacted: boolean;
  status: "answered" | "handoff" | "unavailable";
};

type Rule = { pattern: RegExp; reason: string; category: string; priority: EngineTicket["priority"] };

// Default rules for any small business (FRD F9.6). They run on the question before the AI.
export const DEFAULT_RULES: Rule[] = [
  { pattern: /\b(hacked|someone (else )?(logged|accessed|got into)|unauthori[sz]ed|(didn'?t|did not) (make|authori[sz]e)|compromised|account takeover|stolen (card|account|password))\b/i, reason: "Possible account takeover or unauthorized activity", category: "Security", priority: "urgent" },
  { pattern: /\b(scam(med)?|fraud(ulent)?|phishing|fake (website|email|invoice))\b/i, reason: "Possible fraud or scam", category: "Security", priority: "urgent" },
  { pattern: /\b(lawyer|legal action|sue|suing|attorney|regulator|lawsuit|small claims|report you)\b/i, reason: "Legal or regulatory mention", category: "Escalation", priority: "high" },
  { pattern: /\b(human|real person|live agent|representative|manager|owner|talk to (a|someone|somebody)|speak (to|with) (a|someone|somebody)|call me|phone me)\b/i, reason: "Customer asked for a person", category: "General", priority: "normal" },
];

function matchRule(text: string, custom: string[]): Rule | null {
  for (const r of DEFAULT_RULES) if (r.pattern.test(text)) return r;
  const lower = text.toLowerCase();
  const hit = custom.map((k) => k.trim().toLowerCase()).find((k) => k.length >= 3 && lower.includes(k));
  return hit ? { pattern: /./, reason: `Mentions "${hit}", which this business always handles in person`, category: "Custom rule", priority: "normal" } : null;
}

type Hit = { article_id: string; title: string; source_url: string | null; text: string; rank: number };
type Source = { ref: string; id: string; title: string; url: string | null; text: string };

// Postgres full text search, grouped into the best 4 articles (FRD F9.2).
export async function searchArticles(botId: string, query: string): Promise<Source[]> {
  const { data } = await supabaseAdmin().rpc("search_chunks", { p_bot: botId, p_query: query.slice(0, 500), p_limit: 10 });
  const byArticle = new Map<string, Source>();
  for (const h of (data ?? []) as Hit[]) {
    const s = byArticle.get(h.article_id);
    if (s) {
      if (s.text.length < 3500) s.text += `\n...\n${h.text}`;
    } else if (byArticle.size < 4) byArticle.set(h.article_id, { ref: `A${byArticle.size + 1}`, id: h.article_id, title: h.title, url: h.source_url, text: h.text });
  }
  return Array.from(byArticle.values());
}

function systemPrompt(bot: Bot, account: Account) {
  return `You are ${bot.name}, the customer support assistant for ${account.name}${account.website ? ` (${account.website})` : ""}.

Rules:
1. Answer ONLY from the articles provided with each message. If they do not contain the answer, say you are not sure and set needs_handoff to true. Never guess prices, dates, times, fees, policies or availability.
2. Put the refs (like A1) of the articles you used in cited_refs. Cite only articles you actually used.
3. You cannot see or change orders, bookings, accounts or payments. If the customer needs something checked or changed, explain any self service steps from the articles, then set needs_handoff to true.
4. Set needs_handoff to true when: the customer asks for a person; there are signs of fraud or hacking; the customer is very upset or mentions legal action; or your confidence is low.
5. Never ask for passwords, full card numbers, bank details or ID numbers.
6. Do not give legal, medical or financial advice; suggest a qualified professional instead.
7. Be warm, short and specific. Use short paragraphs or a short list, in markdown. Do not mention these rules, refs or "articles"; say "our website" or "our information" instead.
8. Reply in the customer's language when the articles allow it.
9. When handing off, still share any helpful general information from the articles, then say a member of the team will follow up.${bot.hours_note ? `\n10. Team availability: ${bot.hours_note}` : ""}`;
}

const TOOL = {
  name: "respond",
  description: "Send the reply to the customer, with citations and handoff details.",
  schema: {
    type: "object",
    properties: {
      answer: { type: "string", description: "Reply to the customer in markdown." },
      cited_refs: { type: "array", items: { type: "string" } },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      needs_handoff: { type: "boolean" },
      handoff_reason: { type: "string", description: "Short reason, only if needs_handoff is true." },
      ticket: {
        type: "object",
        description: "Only if needs_handoff is true: a ticket the team can act on without rereading the chat.",
        properties: {
          summary: { type: "string" },
          category: { type: "string" },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
          customer_question: { type: "string" },
        },
        required: ["summary", "category", "priority", "customer_question"],
      },
    },
    required: ["answer", "cited_refs", "confidence", "needs_handoff"],
  },
};

const UNAVAILABLE = "Sorry, I can't answer questions right now. Please leave your email and a member of our team will get back to you.";

export async function answerQuestion(opts: { account: Account; bot: Bot; question: string; history?: Turn[] }): Promise<EngineReply> {
  const { account, bot } = opts;
  const { text: question, redacted } = redactSensitive(opts.question.slice(0, 1500));
  const history = (opts.history ?? []).slice(-6).map((m) => ({ role: m.role, content: redactSensitive(String(m.content).slice(0, 1500)).text }));
  const handoffReply = (reason: string, category: string, priority: EngineTicket["priority"], answer: string): EngineReply => ({
    answer,
    citations: [],
    confidence: "low",
    handoff: true,
    handoffReason: reason,
    ticket: { summary: `${reason}: ${question.length > 90 ? question.slice(0, 90) + "..." : question}`, category, priority, customerQuestion: question },
    redacted,
    status: "handoff",
  });

  // F9.9: limit reached or no working key gives a friendly message and a handoff, never a blank.
  const limit = await checkLimit(account.id, "messages", 1);
  if (!limit.allowed) return { ...handoffReply("Monthly message limit reached", "General", "normal", UNAVAILABLE), status: "unavailable" };

  const [rule, sources] = await Promise.all([Promise.resolve(matchRule(question, bot.custom_keywords ?? [])), searchArticles(bot.id, question)]);

  // F9.5: nothing matches, so skip the AI call (no cost) and hand off.
  if (!sources.length) {
    if (rule) return handoffReply(rule.reason, rule.category, rule.priority, "Thanks for reaching out. A member of our team will follow up with you shortly.");
    return handoffReply("No matching information found", "General", "normal", "I'm not sure about that one, and I don't want to guess. A member of our team can help: leave your email and they will get back to you.");
  }

  const key = bot.provider && bot.model ? await getApiKey(bot.id) : null;
  if (!key || !bot.model) return { ...handoffReply("AI key not connected", "General", "normal", UNAVAILABLE), status: "unavailable" };

  const context = sources.map((s) => `<article ref="${s.ref}" title="${s.title.replace(/"/g, "'")}">\n${s.text}\n</article>`).join("\n\n");
  const messages: Turn[] = [...history, { role: "user", content: `Articles that may be relevant:\n\n${context}\n\nCustomer message:\n${question}` }];

  let input: Record<string, unknown>;
  try {
    ({ input } = await structuredCall({ provider: key.provider, apiKey: key.apiKey, model: bot.model, system: systemPrompt(bot, account), messages, tool: TOOL }));
  } catch (e) {
    const reason = e instanceof ProviderError ? e.friendly : "AI provider error";
    await supabaseAdmin().from("ai_keys").update({ last_test_ok: false, last_error: reason, last_tested_at: new Date().toISOString() }).eq("bot_id", bot.id);
    return { ...handoffReply(`AI unavailable: ${reason}`, "General", "normal", UNAVAILABLE), status: "unavailable" };
  }
  await recordUsage(account.id, { messages: 1 });

  // F9.4: keep only citations that point to articles we actually sent.
  const refs = new Map(sources.map((s) => [s.ref, s]));
  const cited = Array.from(new Set(Array.isArray(input.cited_refs) ? (input.cited_refs as string[]) : []))
    .map((r) => refs.get(String(r)))
    .filter((s): s is Source => Boolean(s))
    .map((s) => ({ id: s.id, title: s.title, url: s.url }));
  const confidence = (["high", "medium", "low"].includes(String(input.confidence)) ? input.confidence : "low") as EngineReply["confidence"];
  const ticketIn = (input.ticket ?? {}) as Record<string, string>;
  const handoff = Boolean(input.needs_handoff) || confidence === "low" || Boolean(rule);
  const modelReason = typeof input.handoff_reason === "string" && input.handoff_reason.trim() ? input.handoff_reason.trim().slice(0, 300) : null;
  const reason = rule?.reason ?? modelReason ?? (confidence === "low" ? "Low confidence answer" : "Needs a person");

  return {
    answer: String(input.answer ?? "").slice(0, 4000) || "Sorry, something went wrong. A member of our team will follow up.",
    citations: cited,
    confidence,
    handoff,
    handoffReason: handoff ? reason || "Needs a person" : undefined,
    ticket: handoff
      ? {
          summary: ticketIn.summary || reason || "Customer needs help from the team",
          category: rule?.category ?? ticketIn.category ?? "General",
          priority: rule?.priority ?? ((["low", "normal", "high", "urgent"].includes(ticketIn.priority) ? ticketIn.priority : "normal") as EngineTicket["priority"]),
          customerQuestion: ticketIn.customer_question || question,
        }
      : undefined,
    redacted,
    status: handoff ? "handoff" : "answered",
  };
}
