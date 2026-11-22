"use server";

import { revalidatePath } from "next/cache";
import { canUseResources, requireBusiness } from "@/lib/bot";
import { normalizeDomain, verifyDomain } from "@/lib/crawler";
import { supabaseAdmin } from "@/lib/supabase/server";
import { allow } from "@/lib/ratelimit";

export type VerifyResult = { ok: boolean; message: string };

export async function addDomain(form: FormData): Promise<void> {
  const { account } = await requireBusiness("/app/import");
  const domain = normalizeDomain(String(form.get("domain") ?? ""));
  if (!domain) return;
  await supabaseAdmin().from("domains").upsert({ account_id: account.id, domain }, { onConflict: "account_id,domain", ignoreDuplicates: true });
  revalidatePath("/app/import");
}

export async function removeDomain(form: FormData): Promise<void> {
  const { account } = await requireBusiness("/app/import");
  await supabaseAdmin().from("domains").delete().eq("account_id", account.id).eq("id", String(form.get("id") ?? ""));
  revalidatePath("/app/import");
}

// FRD F7.1: check the meta tag, file or DNS record.
export async function checkDomain(id: string): Promise<VerifyResult> {
  const { me, account } = await requireBusiness("/app/import");
  if (!canUseResources(account)) return { ok: false, message: "Your account is paused." };
  if (!allow(`verify:${account.id}`, 30)) return { ok: false, message: "Too many checks today. Please try again tomorrow." };
  const admin = supabaseAdmin();
  const { data: d } = await admin.from("domains").select("id,domain,token,verified_at").eq("id", id).eq("account_id", account.id).single();
  if (!d) return { ok: false, message: "Website not found." };
  if (d.verified_at) return { ok: true, message: "Already verified." };
  const res = await verifyDomain(d.domain, d.token);
  if (res.ok) {
    await admin.from("domains").update({ verified_at: new Date().toISOString(), method: res.method }).eq("id", d.id);
    await admin.from("account_events").insert({ account_id: account.id, actor: me.id, event: "domain_verified", detail: { domain: d.domain, method: res.method } });
    revalidatePath("/app/import");
  }
  return { ok: res.ok, message: res.detail };
}
