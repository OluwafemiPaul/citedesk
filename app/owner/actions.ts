"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { DEFAULT_LIMITS, LIMIT_LABELS, type Limits } from "@/lib/limits";
import { SITE_URL } from "@/lib/config";

const str = (f: FormData, k: string, max = 1000) => String(f.get(k) ?? "").trim().slice(0, max);

async function logEvent(accountId: string | null, actor: string, event: string, detail: Record<string, unknown> = {}) {
  await supabaseAdmin().from("account_events").insert({ account_id: accountId, actor, event, detail });
}

// FRD F2.3, F2.4: approve a request, creating (or reopening) the business account.
export async function approveRequest(form: FormData) {
  const owner = await requireOwner();
  const admin = supabaseAdmin();
  const id = str(form, "id", 64);
  const { data: r } = await admin.from("access_requests").select("*").eq("id", id).single();
  if (!r || r.status === "approved") return;

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
  if (!account) return;

  await admin
    .from("access_requests")
    .update({ status: "approved", account_id: account.id, reviewed_by: owner.id, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  await admin.from("profiles").update({ account_id: account.id }).ilike("email", r.email).is("account_id", null);
  await logEvent(account.id, owner.id, "approved", { request_id: id });
  await sendEmail({
    to: r.email,
    subject: "You're approved for CiteDesk",
    text: `Hi ${r.contact_name},\n\nGood news: ${r.business_name} is approved for the CiteDesk pilot.\n\nSign in here with this email address, and the setup wizard will walk you through importing your website and adding the chat to your site:\n${SITE_URL}/login\n\nReply to this email if you have any questions.\n\nThe CiteDesk team`,
  });
  revalidatePath("/owner");
}

export async function declineRequest(form: FormData) {
  const owner = await requireOwner();
  const admin = supabaseAdmin();
  const id = str(form, "id", 64);
  const note = str(form, "note", 500);
  const { data: r } = await admin.from("access_requests").select("email,contact_name,business_name").eq("id", id).single();
  if (!r) return;
  await admin.from("access_requests").update({ status: "declined", review_note: note || null, reviewed_by: owner.id, reviewed_at: new Date().toISOString() }).eq("id", id);
  await logEvent(null, owner.id, "request_declined", { request_id: id, note });
  await sendEmail({
    to: r.email,
    subject: "Your CiteDesk request",
    text: `Hi ${r.contact_name},\n\nThank you for your interest in CiteDesk. We are not able to add ${r.business_name} to the pilot right now.${note ? `\n\n${note}` : ""}\n\nWe will let you know when we open more spots. CiteDesk is also open source if you would like to self host it.\n\nThe CiteDesk team`,
  });
  revalidatePath("/owner");
}

export async function askForInfo(form: FormData) {
  const owner = await requireOwner();
  const admin = supabaseAdmin();
  const id = str(form, "id", 64);
  const note = str(form, "note", 1000);
  const { data: r } = await admin.from("access_requests").select("email,contact_name,business_name").eq("id", id).single();
  if (!r || !note) return;
  await admin.from("access_requests").update({ status: "info_requested", review_note: note, reviewed_by: owner.id, reviewed_at: new Date().toISOString() }).eq("id", id);
  await logEvent(null, owner.id, "info_requested", { request_id: id, note });
  await sendEmail({
    to: r.email,
    subject: "A quick question about your CiteDesk request",
    text: `Hi ${r.contact_name},\n\nThanks for requesting access for ${r.business_name}. Before we approve it, could you help with this?\n\n${note}\n\nJust reply to this email.\n\nThe CiteDesk team`,
  });
  revalidatePath("/owner");
}

// FRD F3.5: pause or resume a business. Paused accounts keep their data.
export async function setAccountStatus(form: FormData) {
  const owner = await requireOwner();
  const id = str(form, "id", 64);
  const status = str(form, "status", 20);
  if (!["approved", "paused", "closed"].includes(status)) return;
  await supabaseAdmin().from("accounts").update({ status, status_reason: str(form, "reason", 300) || null }).eq("id", id);
  await logEvent(id, owner.id, `status_${status}`);
  revalidatePath("/owner");
}

// FRD F3.7: change one account's limits.
export async function updateLimits(form: FormData) {
  const owner = await requireOwner();
  const id = str(form, "id", 64);
  const limits = {} as Limits;
  for (const k of Object.keys(LIMIT_LABELS) as (keyof Limits)[]) {
    const n = Number(form.get(k));
    limits[k] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_LIMITS[k];
  }
  await supabaseAdmin().from("accounts").update({ limits }).eq("id", id);
  await logEvent(id, owner.id, "limits_changed", limits);
  revalidatePath("/owner");
}

// FRD F1.7, F3.6, F3.8: platform switches and the cost alert amount.
export async function updateSettings(form: FormData) {
  const owner = await requireOwner();
  const cost = Number(form.get("cost_alert_usd"));
  const update = {
    requests_paused: form.get("requests_paused") === "on",
    imports_paused: form.get("imports_paused") === "on",
    cost_alert_usd: Number.isFinite(cost) && cost >= 0 ? cost : 10,
    updated_at: new Date().toISOString(),
  };
  await supabaseAdmin().from("platform_settings").update(update).eq("id", 1);
  await logEvent(null, owner.id, "settings_changed", update);
  revalidatePath("/owner");
}
