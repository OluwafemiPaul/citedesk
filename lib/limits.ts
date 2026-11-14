import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { platformOwnerEmail } from "@/lib/auth";
import { SITE_URL } from "@/lib/config";
import { estimateCost } from "@/lib/cost";

// Plan limits (FRD F4). Each account stores its own copy so the owner can change one account.
export type Limits = {
  bots: number;
  pages_per_bot: number;
  imports_per_month: number;
  files: number;
  file_mb: number;
  storage_mb: number;
  messages_per_month: number;
  handoff_emails_per_month: number;
  team_members: number;
};

export const DEFAULT_LIMITS: Limits = {
  bots: 1,
  pages_per_bot: 50,
  imports_per_month: 2,
  files: 20,
  file_mb: 10,
  storage_mb: 50,
  messages_per_month: 1000,
  handoff_emails_per_month: 200,
  team_members: 1,
};

export const LIMIT_LABELS: Record<keyof Limits, string> = {
  bots: "Bots",
  pages_per_bot: "Pages per bot",
  imports_per_month: "Website imports per month",
  files: "Uploaded files",
  file_mb: "Max file size (MB)",
  storage_mb: "Storage (MB)",
  messages_per_month: "Chat messages per month",
  handoff_emails_per_month: "Handoff emails per month",
  team_members: "Team members",
};

export type Usage = {
  messages: number;
  imports: number;
  pages: number;
  storage_bytes: number;
  handoff_emails: number;
};

export const EMPTY_USAGE: Usage = { messages: 0, imports: 0, pages: 0, storage_bytes: 0, handoff_emails: 0 };

// Which monthly usage counter is checked against which limit.
export const METERED: { usage: keyof Usage; limit: keyof Limits; label: string; toLimitUnits?: (n: number) => number }[] = [
  { usage: "messages", limit: "messages_per_month", label: "Chat messages" },
  { usage: "imports", limit: "imports_per_month", label: "Website imports" },
  { usage: "handoff_emails", limit: "handoff_emails_per_month", label: "Handoff emails" },
  { usage: "storage_bytes", limit: "storage_mb", label: "Storage", toLimitUnits: (b) => b / (1024 * 1024) },
];

export function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function withDefaults(limits: Partial<Limits> | null | undefined): Limits {
  return { ...DEFAULT_LIMITS, ...(limits ?? {}) };
}

export async function getUsage(accountId: string): Promise<Usage> {
  const { data } = await supabaseAdmin()
    .from("usage_monthly")
    .select("messages,imports,pages,storage_bytes,handoff_emails")
    .eq("account_id", accountId)
    .eq("month", currentMonth())
    .maybeSingle();
  return { ...EMPTY_USAGE, ...(data ?? {}) };
}

// Server side check before doing anything that costs money (FRD F4: enforced on the server).
export async function checkLimit(accountId: string, usageKey: keyof Usage, adding = 1) {
  const admin = supabaseAdmin();
  const { data: acct } = await admin.from("accounts").select("status,limits").eq("id", accountId).single();
  if (!acct || acct.status !== "approved") return { allowed: false, reason: "Account is not active" as const };
  const { data: settings } = await admin.from("platform_settings").select("imports_paused").eq("id", 1).single();
  if (usageKey === "imports" && settings?.imports_paused) return { allowed: false, reason: "Imports are paused" as const };
  const m = METERED.find((x) => x.usage === usageKey);
  if (!m) return { allowed: true as const };
  const limits = withDefaults(acct.limits);
  const usage = await getUsage(accountId);
  const conv = m.toLimitUnits ?? ((n: number) => n);
  const after = conv(usage[usageKey] + adding);
  return after <= limits[m.limit]
    ? { allowed: true as const }
    : { allowed: false, reason: `${m.label} limit reached` as const };
}

// Adds usage, then emails alerts the first time an account passes 80% and 100% of a limit this month (FRD F3.8).
export async function recordUsage(accountId: string, delta: Partial<Usage>) {
  const admin = supabaseAdmin();
  const { data: row } = await admin.rpc("add_usage", {
    p_account: accountId,
    p_messages: delta.messages ?? 0,
    p_imports: delta.imports ?? 0,
    p_pages: delta.pages ?? 0,
    p_storage_bytes: delta.storage_bytes ?? 0,
    p_handoff_emails: delta.handoff_emails ?? 0,
  });
  const usage = { ...EMPTY_USAGE, ...(row ?? {}) } as Usage;
  const { data: acct } = await admin.from("accounts").select("name,contact_email,limits").eq("id", accountId).single();
  if (!acct) return usage;
  const limits = withDefaults(acct.limits);
  const month = currentMonth();

  for (const m of METERED) {
    if (!delta[m.usage]) continue;
    const used = (m.toLimitUnits ?? ((n: number) => n))(usage[m.usage]);
    const pct = used / Math.max(limits[m.limit], 1);
    const level = pct >= 1 ? 100 : pct >= 0.8 ? 80 : 0;
    if (!level) continue;
    const { data: already } = await admin
      .from("account_events")
      .select("id")
      .eq("account_id", accountId)
      .eq("event", "limit_alert")
      .contains("detail", { metric: m.usage, level, month })
      .limit(1);
    if (already?.length) continue;
    await admin.from("account_events").insert({ account_id: accountId, event: "limit_alert", detail: { metric: m.usage, level, month } });
    const text = `${acct.name} has used ${level}% of its ${m.label.toLowerCase()} limit this month (${Math.round(used)} of ${limits[m.limit]}).\n\n${
      level === 100 ? "This feature is now paused until next month or until the limit is raised." : "No action is needed yet."
    }\n\n${SITE_URL}`;
    const to = [acct.contact_email, platformOwnerEmail()].filter(Boolean);
    await sendEmail({ to, subject: `CiteDesk: ${m.label} at ${level}% for ${acct.name}`, text });
  }
  await checkTotalCostAlert();
  return usage;
}

// Emails the platform owner once a month when the estimated total cost passes the alert amount (FRD F3.8).
export async function checkTotalCostAlert() {
  const admin = supabaseAdmin();
  const month = currentMonth();
  const [{ data: settings }, { data: rows }] = await Promise.all([
    admin.from("platform_settings").select("cost_alert_usd,unit_costs").eq("id", 1).single(),
    admin.from("usage_monthly").select("messages,imports,pages,storage_bytes,handoff_emails").eq("month", month),
  ]);
  if (!settings || !rows) return;
  const total = rows.reduce((sum, r) => sum + estimateCost({ ...EMPTY_USAGE, ...r }, settings.unit_costs), 0);
  if (total < Number(settings.cost_alert_usd)) return;
  const { data: already } = await admin.from("account_events").select("id").eq("event", "cost_alert").contains("detail", { month }).limit(1);
  if (already?.length) return;
  await admin.from("account_events").insert({ account_id: null, event: "cost_alert", detail: { month, total } });
  if (platformOwnerEmail()) {
    await sendEmail({
      to: platformOwnerEmail(),
      subject: `CiteDesk: estimated cost passed $${settings.cost_alert_usd}`,
      text: `The estimated platform cost this month is $${total.toFixed(2)}, above your alert amount of $${settings.cost_alert_usd}.\n\nReview usage: ${SITE_URL}/owner`,
    });
  }
}
