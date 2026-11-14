// Sends email through Resend's HTTP API. Without RESEND_API_KEY (local development),
// emails are printed to the server log instead, so every flow still works.

type Mail = { to: string | string[]; subject: string; text: string; replyTo?: string };

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendEmail(mail: Mail): Promise<{ ok: boolean; logged?: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "CiteDesk <onboarding@resend.dev>";
  if (!key) {
    console.log(`[email not sent: RESEND_API_KEY missing]\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
    return { ok: true, logged: true };
  }
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap">${escapeHtml(mail.text)}</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text, html, reply_to: mail.replyTo }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text().catch(() => ""));
  return { ok: res.ok };
}
