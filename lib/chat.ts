// Public chat (FRD F10): stores conversations and answers visitors with the engine.

import { supabaseAdmin } from "@/lib/supabase/server";
import { withDefaults } from "@/lib/limits";
import { answerQuestion, type EngineCitation } from "@/lib/engine";
import { articleLink, type PublicBot } from "@/lib/widget";
import type { Account } from "@/lib/bot";
import { redactSensitive } from "@/lib/policy";

export const MAX_MESSAGES_PER_CONVERSATION = 40;

export type PublicReply = {
  conversationId: string;
  messageId: string;
  answer: string;
  citations: { title: string; url: string }[];
  handoff: boolean;
};

export async function accountFor(bot: PublicBot): Promise<Account | null> {
  const { data } = await supabaseAdmin().from("accounts").select("id,name,website,status,contact_email,limits").eq("id", bot.account_id).single();
  return data ? ({ ...data, limits: withDefaults(data.limits) } as Account) : null;
}

// Finds the visitor's conversation or starts one. A conversation id only works with its own visitor id.
export async function getConversation(bot: PublicBot, visitorId: string, conversationId: string | null, channel: "widget" | "help", pageUrl: string | null) {
  const admin = supabaseAdmin();
  if (conversationId && /^[0-9a-f-]{36}$/.test(conversationId)) {
    const { data } = await admin.from("conversations").select("id,message_count,handoff").eq("id", conversationId).eq("bot_id", bot.id).eq("visitor_id", visitorId).maybeSingle();
    if (data) return data;
  }
  const { data, error } = await admin
    .from("conversations")
    .insert({ account_id: bot.account_id, bot_id: bot.id, visitor_id: visitorId, channel, page_url: pageUrl?.slice(0, 500) ?? null })
    .select("id,message_count,handoff")
    .single();
  if (error || !data) throw new Error("could not start conversation");
  return data;
}

export async function chat(opts: { bot: PublicBot; account: Account; visitorId: string; conversationId: string | null; message: string; channel: "widget" | "help"; pageUrl: string | null }): Promise<PublicReply | { error: string; status: number }> {
  const { bot, account } = opts;
  const admin = supabaseAdmin();
  const conv = await getConversation(bot, opts.visitorId, opts.conversationId, opts.channel, opts.pageUrl);
  if (conv.message_count >= MAX_MESSAGES_PER_CONVERSATION) {
    return { error: "This chat has reached its length limit. Please start a new chat or use Talk to a person.", status: 429 };
  }
  const { data: past } = await admin.from("messages").select("role,content").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(6);
  const history = (past ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const reply = await answerQuestion({ account, bot, question: opts.message, history });
  const safe = redactSensitive(opts.message).text; // never store card or ID numbers (FRD F14)
  const citations = reply.citations.map((c: EngineCitation) => ({ id: c.id, title: c.title, url: articleLink(bot.slug, c) }));

  const { data: rows } = await admin
    .from("messages")
    .insert([
      { account_id: account.id, conversation_id: conv.id, role: "user", content: safe },
      { account_id: account.id, conversation_id: conv.id, role: "assistant", content: reply.answer, question: safe.slice(0, 500), citations, confidence: reply.confidence, status: reply.status, handoff_reason: reply.handoffReason ?? null, ticket: reply.ticket ?? null },
    ])
    .select("id,role");
  const assistantId = rows?.find((r) => r.role === "assistant")?.id ?? "";
  await admin
    .from("conversations")
    .update({ message_count: conv.message_count + 2, last_at: new Date().toISOString(), ...(reply.handoff ? { handoff: true } : {}) })
    .eq("id", conv.id);

  return { conversationId: conv.id, messageId: assistantId, answer: reply.answer, citations: citations.map(({ title, url }) => ({ title, url })), handoff: reply.handoff };
}
