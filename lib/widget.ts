import { supabaseAdmin } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/config";
import type { Bot } from "@/lib/bot";

export const OWN_HOST = new URL(SITE_URL).hostname;

export type PublicBot = Bot & { account_name: string; account_status: string };

export async function botByPublicId(publicId: string): Promise<PublicBot | null> {
  if (!/^[a-f0-9]{32}$/.test(publicId)) return null;
  const { data } = await supabaseAdmin().from("bots").select("*, accounts!inner(name,status)").eq("public_id", publicId).maybeSingle();
  if (!data) return null;
  const { accounts, ...bot } = data as Bot & { accounts: { name: string; status: string } };
  return { ...(bot as Bot), account_name: accounts.name, account_status: accounts.status };
}

export async function botBySlug(slug: string): Promise<PublicBot | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const { data } = await supabaseAdmin().from("bots").select("*, accounts!inner(name,status)").eq("slug", slug).maybeSingle();
  if (!data) return null;
  const { accounts, ...bot } = data as Bot & { accounts: { name: string; status: string } };
  return { ...(bot as Bot), account_name: accounts.name, account_status: accounts.status };
}

// A bot is live when its business is approved and an AI model is connected.
export const isLive = (b: PublicBot) => b.account_status === "approved" && Boolean(b.model && b.provider);

// FRD F10.6: the bubble only loads on the business's verified domains (and on CiteDesk itself for testing).
export async function isAllowedHost(accountId: string, host: string | null): Promise<boolean> {
  if (!host) return false;
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h === OWN_HOST) return true;
  const bare = h.replace(/^www\./, "");
  const { data } = await supabaseAdmin().from("domains").select("domain").eq("account_id", accountId).eq("domain", bare).not("verified_at", "is", null).maybeSingle();
  return Boolean(data);
}

export function hostFrom(urlish: string | null): string | null {
  if (!urlish) return null;
  try {
    return new URL(urlish).hostname;
  } catch {
    return null;
  }
}

export const articleLink = (slug: string | null, c: { id: string; url: string | null }) => c.url ?? `${SITE_URL}/help/${slug}/a/${c.id}`;
