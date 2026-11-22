"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { addNotice } from "@/lib/notices";
import { DEFAULT_LIMITS, LIMIT_LABELS, type Limits } from "@/lib/limits";
import { SITE_URL } from "@/lib/config";
import { approveAccessRequest } from "@/lib/approve";

const str = (f: FormData, k: string, max = 1000) => String(f.get(k) ?? "").trim().slice(0, max);

async function logEvent(accountId: string | null, actor: string, event: string, detail: Record<string, unknown> = {}) {
  await supabaseAdmin().from("account_events").insert({ account_id: accountId, actor, event, detail });
}

// FRD F2.3, F2.4: approve a request, creating (or reopening) the business account.
export async function approveRequest(form: FormData) {
  const owner = await requireOwner();
  await approveAccessRequest(str(form, "id", 64), owner.id);
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
    kind: "request_declined",
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
    kind: "info_requested",
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
  if (status === "paused") await addNotice(id, "paused", "Your account is paused", "Your bot shows an offline message for now. Your data is safe. Reply to any CiteDesk email or contact the CiteDesk team to resolve this.");
  if (status === "approved") await addNotice(id, "resumed", "Your account is active again", "Your bot is back online.");
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
    auto_approve: form.get("auto_approve") === "on",
    cost_alert_usd: Number.isFinite(cost) && cost >= 0 ? cost : 10,
    updated_at: new Date().toISOString(),
  };
  await supabaseAdmin().from("platform_settings").update(update).eq("id", 1);
  await logEvent(null, owner.id, "settings_changed", update);
  revalidatePath("/owner");
}

// Sends a test email so the owner can check the email setup (any address you own).
export async function sendTestEmail(form: FormData) {
  const owner = await requireOwner();
  const to = str(form, "to", 200) || owner.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
  await sendEmail({
    kind: "test",
    to,
    subject: "CiteDesk test email",
    text: `This is a test email from CiteDesk, sent at ${new Date().toUTCString()}.\n\nIf it reached your inbox (not spam), CiteDesk can email businesses.\n\n${SITE_URL}`,
  });
  revalidatePath("/owner");
}
