// Handoff tickets (FRD F11): saved for the dashboard and emailed to the business with the transcript.

import { supabaseAdmin } from "@/lib/supabase/server";
import { checkLimit, recordUsage } from "@/lib/limits";
import { sendEmail } from "@/lib/email";
import { addNotice } from "@/lib/notices";
import { redactSensitive } from "@/lib/policy";
import { SITE_URL } from "@/lib/config";
import { getConversation } from "@/lib/chat";
import type { Account } from "@/lib/bot";
import type { PublicBot } from "@/lib/widget";
import type { EngineTicket } from "@/lib/engine";

type Draft = EngineTicket & { reason: string };

export async function createTicket(opts: {
  bot: PublicBot;
  account: Account;
  visitorId: string;
  conversationId: string | null;
  email: string;
  name: string | null;
  note: string | null;
  channel: "widget" | "help";
}): Promise<{ ok: true; ticketId: string } | { ok: false; error: string }> {
  const { bot, account } = opts;
  const admin = supabaseAdmin();
  const conv = await getConversation(bot, opts.visitorId, opts.conversationId, opts.channel, null);

  const { data: existing } = await admin.from("tickets").select("id").eq("conversation_id", conv.id).eq("status", "open").maybeSingle();
  if (existing) return { ok: true, ticketId: existing.id };

  const { data: msgs } = await admin.from("messages").select("role,content,ticket,handoff_reason,created_at").eq("conversation_id", conv.id).order("created_at").limit(80);
  const list = msgs ?? [];
  const note = opts.note ? redactSensitive(opts.note.slice(0, 1000)).text : null;
  const lastDraft = [...list].reverse().find((m) => m.role === "assistant" && m.ticket);
  const lastUser = [...list].reverse().find((m) => m.role === "user");
  const draft: Draft = lastDraft?.ticket
    ? { ...(lastDraft.ticket as EngineTicket), reason: lastDraft.handoff_reason ?? (lastDraft.ticket as EngineTicket).summary }
    : { summary: "Customer asked to talk to a person", category: "General", priority: "normal", customerQuestion: lastUser?.content ?? note ?? "(no question typed)", reason: "Customer asked for a person" };

  const who = opts.name ? `${opts.name} <${opts.email}>` : opts.email;
  const transcript = [
    ...list.map((m) => `${m.role === "user" ? "Customer" : bot.name}: ${m.content}`),
    ...(note ? [`Customer (note with handoff): ${note}`] : []),
  ].join("\n\n") || "(The customer asked for a person before chatting.)";

  const { data: ticket, error } = await admin
    .from("tickets")
    .insert({
      account_id: account.id,
      bot_id: bot.id,
      conversation_id: conv.id,
      summary: draft.summary.slice(0, 300),
      category: draft.category.slice(0, 60),
      priority: draft.priority,
      reason: draft.reason.slice(0, 300),
      question: draft.customerQuestion.slice(0, 1000),
      transcript: transcript.slice(0, 30000),
      visitor_email: opts.email,
      visitor_name: opts.name,
    })
    .select("id")
    .single();
  if (error || !ticket) return { ok: false, error: "Could not send your request. Please try again." };
  await admin.from("conversations").update({ handoff: true, last_at: new Date().toISOString() }).eq("id", conv.id);

  // F11.2 to F11.5: email the business, unless the monthly handoff email limit is reached.
  const to = bot.handoff_email || account.contact_email;
  let emailStatus: string;
  const limit = await checkLimit(account.id, "handoff_emails", 1);
  if (!limit.allowed) {
    emailStatus = "over_limit";
    await addNotice(account.id, "ticket_email_limit", "New ticket (email limit reached)", `A customer (${opts.email}) asked for help, but your monthly handoff email limit is used up, so no email was sent. Open Tickets in your dashboard to reply.`);
  } else {
    const urgent = draft.priority === "urgent";
    const res = await sendEmail({
      kind: "ticket",
      accountId: account.id,
      to,
      replyTo: opts.email,
      subject: `${urgent ? "[URGENT] " : draft.priority === "high" ? "[High] " : ""}Customer question: ${draft.summary}`.slice(0, 180),
      text: [
        `A customer asked for help through your ${opts.channel === "help" ? "help page" : "website chat"}. Reply to this email to answer them directly.`,
        "",
        `From: ${who}`,
        `Priority: ${draft.priority}`,
        `Category: ${draft.category}`,
        `Why it was handed off: ${draft.reason}`,
        "",
        `Their question: ${draft.customerQuestion}`,
        ...(note ? ["", `Their note: ${note}`] : []),
        "",
        "Full conversation:",
        "",
        transcript,
        "",
        `Manage tickets: ${SITE_URL}/app/tickets`,
      ].join("\n"),
    });
    emailStatus = res.ok ? "sent" : "failed";
    if (res.ok) await recordUsage(account.id, { handoff_emails: 1 });
  }
  await admin.from("tickets").update({ email_status: emailStatus }).eq("id", ticket.id);
  return { ok: true, ticketId: ticket.id };
}
