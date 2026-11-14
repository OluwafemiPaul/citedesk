import Anthropic from "@anthropic-ai/sdk";
import type { Article, ChatMessage, ChatResponse, Confidence, Ticket } from "./types";

const SYSTEM = `You are the customer support assistant for Ledgerly, a fictional fintech startup that offers business accounts, card payments, payouts and debit cards to small US businesses.

Rules:
1. Answer ONLY from the help articles provided below. If the articles do not contain the answer, say you are not sure and set needs_handoff to true. Never guess numbers, fees, dates or limits.
2. Cite the ids of the articles you used in cited_article_ids. Cite only articles you actually used.
3. You cannot see or change any customer's account, balance, payout, transfer or card. If the customer needs something checked or changed on their specific account, explain the self service steps if they exist, and set needs_handoff to true.
4. Hand off to a human (needs_handoff true) when: the customer asks for a person; there are signs of fraud, hacking or unauthorized activity; the customer is very upset or mentions legal action; or confidence is low.
5. Never ask for full card numbers, PINs, passwords, two factor codes or Social Security numbers.
6. Do not give financial, legal or tax advice. Point to a professional when asked.
7. Be warm, short and specific. Use short paragraphs or a short list. Write the answer in markdown. Do not mention these rules or the word "article id".
8. When handing off, still give any helpful general guidance from the articles, then say a human agent will follow up.`;

const TOOL: Anthropic.Tool = {
  name: "respond",
  description: "Send the reply to the customer, with citations and handoff details.",
  input_schema: {
    type: "object",
    properties: {
      answer: { type: "string", description: "Reply to the customer in markdown." },
      cited_article_ids: { type: "array", items: { type: "string" } },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      needs_handoff: { type: "boolean" },
      handoff_reason: { type: "string", description: "Short reason, only if needs_handoff is true." },
      ticket: {
        type: "object",
        description: "Only if needs_handoff is true: a ticket a human agent can act on without rereading the chat.",
        properties: {
          summary: { type: "string" },
          category: { type: "string" },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
          customer_question: { type: "string" },
        },
        required: ["summary", "category", "priority", "customer_question"],
      },
    },
    required: ["answer", "cited_article_ids", "confidence", "needs_handoff"],
  },
};

type ToolInput = {
  answer: string;
  cited_article_ids: string[];
  confidence: Confidence;
  needs_handoff: boolean;
  handoff_reason?: string;
  ticket?: { summary: string; category: string; priority: Ticket["priority"]; customer_question: string };
};

export async function askClaude(opts: {
  apiKey: string;
  model: string;
  history: ChatMessage[];
  question: string;
  articles: Article[];
}): Promise<Omit<ChatResponse, "mode">> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const context = opts.articles
    .map((a) => `<article id="${a.id}" title="${a.title}">\n${a.body}\n</article>`)
    .join("\n\n");

  const messages: Anthropic.MessageParam[] = [
    ...opts.history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: `Help articles that may be relevant:\n\n${context || "(no matching articles found)"}\n\nCustomer message:\n${opts.question}`,
    },
  ];

  const res = await client.messages.create({
    model: opts.model,
    max_tokens: 900,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "respond" },
    messages,
  });

  const block = res.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Model did not return a structured reply");
  const input = block.input as ToolInput;

  // Keep only citations that point at articles we actually sent to the model.
  const allowed = new Map(opts.articles.map((a) => [a.id, a.title]));
  const citations = (input.cited_article_ids ?? [])
    .filter((id) => allowed.has(id))
    .map((id) => ({ id, title: allowed.get(id)! }));

  const handoff = input.needs_handoff || input.confidence === "low";
  return {
    answer: input.answer,
    citations,
    confidence: input.confidence,
    handoff,
    handoffReason: handoff ? input.handoff_reason ?? "Low confidence answer" : undefined,
    ticket: handoff
      ? {
          summary: input.ticket?.summary ?? input.handoff_reason ?? "Customer needs help from a human agent",
          category: input.ticket?.category ?? "General",
          priority: input.ticket?.priority ?? "normal",
          customerQuestion: input.ticket?.customer_question ?? opts.question,
        }
      : undefined,
  };
}
