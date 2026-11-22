import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { addNotice } from "@/lib/notices";
import { DEFAULT_LIMITS } from "@/lib/limits";
import { SITE_URL } from "@/lib/config";

// FRD F2.3, F2.4: approve a request, creating (or reopening) the business account.
// Used by the owner's Approve button and by auto approve in self hosted mode (F13.3).
export async function approveAccessRequest(requestId: string, reviewerId: string | null): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data: r } = await admin.from("access_requests").select("*").eq("id", requestId).single();
  if (!r || r.status === "approved") return null;

  const fields = {
    name: r.business_name,
    website: r.website,
    business_type: r.business_type,
    contact_name: r.contact_name,
    contact_email: r.email.toLowerCase(),
    status: "approved",
    approved_at: new Date().toISOString(),
    status_reason: null,
  };
  const { data: existing } = await admin.from("accounts").select("id").ilike("contact_email", r.email).maybeSingle();
  const { data: account } = existing
    ? await admin.from("accounts").update(fields).eq("id", existing.id).select("id").single()
    : await admin.from("accounts").insert({ ...fields, limits: DEFAULT_LIMITS }).select("id").single();
  if (!account) return null;

  await admin.from("access_requests").update({ status: "approved", account_id: account.id, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }).eq("id", requestId);
  await admin.from("profiles").update({ account_id: account.id }).ilike("email", r.email).is("account_id", null);
  await admin.from("account_events").insert({ account_id: account.id, actor: reviewerId, event: reviewerId ? "approved" : "auto_approved", detail: { request_id: requestId } });
  await addNotice(account.id, "approved", "Welcome to CiteDesk", `${r.business_name} is approved. The setup steps below walk you through connecting your AI key, adding your knowledge and putting the chat on your website.`);
  await sendEmail({
    kind: "approved",
    accountId: account.id,
    to: r.email,
    subject: "You're approved for CiteDesk",
    text: `Hi ${r.contact_name},\n\nGood news: ${r.business_name} is approved for CiteDesk.\n\nSign in here with this email address, and the setup wizard will walk you through importing your website and adding the chat to your site:\n${SITE_URL}/login\n\nReply to this email if you have any questions.\n\nThe CiteDesk team`,
  });
  return account.id;
}
