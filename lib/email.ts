// Sends CiteDesk's own emails and records every attempt in the email_log table.
//
// Provider is picked by EMAIL_PROVIDER (smtp, resend or log). When it is not set:
//   SMTP_USER set      -> smtp   (for example a Gmail account with an app password)
//   RESEND_API_KEY set -> resend (best once you own a domain)
//   neither            -> log    (local development: the email is printed to the server log)
// Switching from Gmail to a domain later is a settings change, not a code change.

import nodemailer, { type Transporter } from "nodemailer";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";

export type Mail = {
  to: string | string[];
  subject: string;
  text: string;
  replyTo?: string;
  kind?: string;
  accountId?: string | null;
};

export type SendResult = { ok: boolean; status: "sent" | "failed" | "logged"; error?: string };

type Provider = "smtp" | "resend" | "log";

export function emailProvider(): Provider {
  const p = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  if (p === "smtp" || p === "resend" || p === "log") return p;
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return "log";
}

function fromAddress(provider: Provider) {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  if (provider === "smtp" && process.env.SMTP_USER) return `CiteDesk <${process.env.SMTP_USER}>`;
  return "CiteDesk <onboarding@resend.dev>";
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let transporter: Transporter | null = null;
function smtp() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

async function deliver(provider: Provider, mail: Mail, to: string[]): Promise<SendResult> {
  const from = fromAddress(provider);
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap">${escapeHtml(mail.text)}</div>`;

  if (provider === "log") {
    console.log(`[email not sent: no email provider set]\nTo: ${to.join(", ")}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
    return { ok: true, status: "logged" };
  }

  if (provider === "smtp") {
    await smtp().sendMail({ from, to, subject: mail.subject, text: mail.text, html, replyTo: mail.replyTo });
    return { ok: true, status: "sent" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: mail.subject, text: mail.text, html, reply_to: mail.replyTo }),
  });
  if (res.ok) return { ok: true, status: "sent" };
  const body = await res.text().catch(() => "");
  return { ok: false, status: "failed", error: `Resend ${res.status}: ${body.slice(0, 300)}` };
}

// Never throws: a failed email must not break approvals, tickets or sign up.
export async function sendEmail(mail: Mail): Promise<SendResult> {
  const provider = emailProvider();
  const to = (Array.isArray(mail.to) ? mail.to : [mail.to]).filter(Boolean);
  let result: SendResult;
  if (!to.length) {
    result = { ok: false, status: "failed", error: "No recipient" };
  } else {
    try {
      result = await deliver(provider, mail, to);
    } catch (e) {
      result = { ok: false, status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : String(e) };
    }
  }
  if (!result.ok) console.error("email failed", mail.kind, result.error);

  if (isSupabaseConfigured()) {
    try {
      await supabaseAdmin().from("email_log").insert({
        account_id: mail.accountId ?? null,
        kind: mail.kind || "other",
        to_addresses: to,
        subject: mail.subject,
        body: mail.text.slice(0, 8000),
        provider,
        status: result.status,
        error: result.error ?? null,
      });
    } catch (e) {
      console.error("email_log insert failed", e);
    }
  }
  return result;
}
