import { redirect } from "next/navigation";
import { currentProfile, type Profile } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { withDefaults, type Limits } from "@/lib/limits";
import type { Provider } from "@/lib/providers";

export type Bot = {
  id: string;
  account_id: string;
  public_id: string;
  name: string;
  welcome_message: string;
  brand_color: string;
  logo_url: string | null;
  bubble_position: "left" | "right";
  handoff_email: string | null;
  hours_note: string | null;
  custom_keywords: string[];
  provider: Provider | null;
  model: string | null;
  setup_step: number;
  slug: string | null;
  installed_at: string | null;
  installed_on: string | null;
  retention_days: 30 | 90 | 365;
  show_powered_by: boolean;
};

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "help";
}

// Gives every bot a public help page address like /help/joes-bakery (FRD F10.7).
async function ensureSlug(bot: Bot, accountName: string): Promise<Bot> {
  if (bot.slug) return bot;
  const admin = supabaseAdmin();
  const base = slugify(accountName.replace(/\(.*?\)/g, ""));
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await admin.from("bots").update({ slug }).eq("id", bot.id).is("slug", null).select("*").maybeSingle();
    if (!error && data) return data as Bot;
    if (!error && !data) break;
  }
  const { data } = await admin.from("bots").select("*").eq("id", bot.id).single();
  return (data as Bot) ?? bot;
}

export type Account = { id: string; name: string; website: string | null; status: string; contact_email: string; limits: Limits };

export type BusinessContext = { me: Profile; account: Account; bot: Bot };

export async function getOrCreateBot(accountId: string, name?: string): Promise<Bot> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("bots").select("*").eq("account_id", accountId).maybeSingle();
  if (data) return data.slug ? (data as Bot) : ensureSlug(data as Bot, name ?? "help");
  const { data: created, error } = await admin
    .from("bots")
    .upsert({ account_id: accountId, ...(name ? { name: `${name} assistant`.slice(0, 60) } : {}) }, { onConflict: "account_id" })
    .select("*")
    .single();
  if (error || !created) throw new Error(`Could not create bot: ${error?.message}`);
  return ensureSlug(created as Bot, name ?? "help");
}

// For business pages and actions: signed in, linked to an approved (or paused) business.
// Paused businesses can look around but not run imports or AI (checked by callers with canUseResources).
export async function requireBusiness(next = "/app"): Promise<BusinessContext> {
  const me = await currentProfile();
  if (!me) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!me.account_id) redirect(me.role === "platform_owner" ? "/owner" : "/app");
  const { data: acct } = await supabaseAdmin().from("accounts").select("id,name,website,status,contact_email,limits").eq("id", me.account_id).single();
  if (!acct || !["approved", "paused"].includes(acct.status)) redirect("/app");
  const account = { ...acct, limits: withDefaults(acct.limits) } as Account;
  const bot = await getOrCreateBot(account.id, account.name);
  return { me, account, bot };
}

export function canUseResources(account: Account) {
  return account.status === "approved";
}

export type KeyStatus = { provider: Provider; last4: string; last_test_ok: boolean | null; last_tested_at: string | null; last_error: string | null } | null;

export async function getKeyStatus(botId: string): Promise<KeyStatus> {
  const { data } = await supabaseAdmin().from("ai_keys").select("provider,last4,last_test_ok,last_tested_at,last_error").eq("bot_id", botId).maybeSingle();
  return (data as KeyStatus) ?? null;
}

// Server only. Never send the result to the browser or a log.
export async function getApiKey(botId: string): Promise<{ provider: Provider; apiKey: string } | null> {
  const { data } = await supabaseAdmin().from("ai_keys").select("provider,encrypted_key").eq("bot_id", botId).maybeSingle();
  if (!data) return null;
  try {
    return { provider: data.provider as Provider, apiKey: decrypt(data.encrypted_key) };
  } catch {
    return null;
  }
}

// Same as requireBusiness but for API routes: returns null instead of redirecting.
export async function businessFromSession(): Promise<BusinessContext | null> {
  const me = await currentProfile();
  if (!me?.account_id) return null;
  const { data: acct } = await supabaseAdmin().from("accounts").select("id,name,website,status,contact_email,limits").eq("id", me.account_id).single();
  if (!acct || !["approved", "paused"].includes(acct.status)) return null;
  const account = { ...acct, limits: withDefaults(acct.limits) } as Account;
  return { me, account, bot: await getOrCreateBot(account.id, account.name) };
}
