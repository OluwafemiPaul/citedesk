"use server";

import { revalidatePath } from "next/cache";
import { canUseResources, getApiKey, requireBusiness } from "@/lib/bot";
import { encrypt, isEncryptionConfigured } from "@/lib/crypto";
import { isProvider, listModels, pingModel, PROVIDERS, ProviderError, type ModelOption, type Provider } from "@/lib/providers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { allow } from "@/lib/ratelimit";

export type KeyResult = { ok: boolean; error?: string; models?: ModelOption[]; model?: string; last4?: string };

const message = (e: unknown) => (e instanceof ProviderError ? e.friendly : "Something went wrong. Please try again.");

async function logEvent(accountId: string, actor: string, event: string, detail: Record<string, unknown> = {}) {
  await supabaseAdmin().from("account_events").insert({ account_id: accountId, actor, event, detail });
}

// FRD F6.2 to F6.4: test a new key, then store it encrypted. The key never goes back to the browser.
export async function saveKey(provider: string, rawKey: string): Promise<KeyResult> {
  const { me, account, bot } = await requireBusiness("/app/setup");
  if (!canUseResources(account)) return { ok: false, error: "Your account is paused, so keys cannot be changed right now." };
  if (!isEncryptionConfigured()) return { ok: false, error: "This CiteDesk copy is missing its ENCRYPTION_KEY setting, so keys cannot be stored safely yet." };
  if (!isProvider(provider)) return { ok: false, error: "Choose Anthropic or OpenAI." };
  if (!allow(`keytest:${account.id}`, 20)) return { ok: false, error: "Too many key tests today. Please try again tomorrow." };

  const apiKey = rawKey.trim().replace(/\s+/g, "");
  const info = PROVIDERS.find((p) => p.id === provider)!;
  if (apiKey.length < 20 || apiKey.length > 300) return { ok: false, error: "That does not look like a full API key. Copy it again from the provider's console." };
  if (provider === "openai" && apiKey.startsWith("sk-ant-")) return { ok: false, error: "This looks like an Anthropic key. Choose Anthropic above." };
  if (!apiKey.startsWith(info.keyPrefix)) return { ok: false, error: `${info.label} keys start with "${info.keyPrefix}". Check you copied the right key.` };

  let models: ModelOption[];
  let model: string;
  try {
    models = await listModels(provider, apiKey);
    if (!models.length) return { ok: false, error: "This key works but has no chat models available. Check the account in the provider's console." };
    model = bot.provider === provider && bot.model && models.some((m) => m.id === bot.model) ? bot.model : models[0].id;
    await pingModel(provider, apiKey, model);
  } catch (e) {
    return { ok: false, error: message(e) };
  }

  const admin = supabaseAdmin();
  const last4 = apiKey.slice(-4);
  const { error } = await admin.from("ai_keys").upsert(
    { bot_id: bot.id, account_id: account.id, provider, encrypted_key: encrypt(apiKey), last4, last_tested_at: new Date().toISOString(), last_test_ok: true, last_error: null, updated_at: new Date().toISOString() },
    { onConflict: "bot_id" },
  );
  if (error) return { ok: false, error: "Could not save the key. Please try again." };
  await admin.from("bots").update({ provider, model, setup_step: Math.max(bot.setup_step, 2), updated_at: new Date().toISOString() }).eq("id", bot.id);
  await logEvent(account.id, me.id, "ai_key_saved", { provider, last4 });
  revalidatePath("/app/setup");
  return { ok: true, models, model, last4 };
}

// Retests the stored key, optionally with a different model (FRD F6.3, F6.5).
export async function testStoredKey(model?: string): Promise<KeyResult> {
  const { account, bot } = await requireBusiness("/app/setup");
  if (!canUseResources(account)) return { ok: false, error: "Your account is paused." };
  if (!allow(`keytest:${account.id}`, 20)) return { ok: false, error: "Too many key tests today. Please try again tomorrow." };
  const stored = await getApiKey(bot.id);
  if (!stored) return { ok: false, error: "No key saved yet." };
  const admin = supabaseAdmin();
  let models: ModelOption[];
  const chosen = (model || bot.model || "").slice(0, 100);
  try {
    models = await listModels(stored.provider, stored.apiKey);
    const use = models.some((m) => m.id === chosen) ? chosen : models[0]?.id;
    if (!use) throw new ProviderError("This key has no chat models available.");
    await pingModel(stored.provider, stored.apiKey, use);
    await admin.from("ai_keys").update({ last_tested_at: new Date().toISOString(), last_test_ok: true, last_error: null }).eq("bot_id", bot.id);
    await admin.from("bots").update({ model: use, provider: stored.provider as Provider, updated_at: new Date().toISOString() }).eq("id", bot.id);
    revalidatePath("/app/setup");
    return { ok: true, models, model: use };
  } catch (e) {
    await admin.from("ai_keys").update({ last_tested_at: new Date().toISOString(), last_test_ok: false, last_error: message(e) }).eq("bot_id", bot.id);
    revalidatePath("/app/setup");
    return { ok: false, error: message(e) };
  }
}

export async function removeKey(): Promise<void> {
  const { me, account, bot } = await requireBusiness("/app/setup");
  await supabaseAdmin().from("ai_keys").delete().eq("bot_id", bot.id);
  await logEvent(account.id, me.id, "ai_key_removed");
  revalidatePath("/app/setup");
}

export async function setSetupStep(step: number): Promise<void> {
  const { bot } = await requireBusiness("/app/setup");
  const n = Math.max(1, Math.min(7, Math.floor(step)));
  if (n > bot.setup_step) await supabaseAdmin().from("bots").update({ setup_step: n }).eq("id", bot.id);
  revalidatePath("/app/setup");
}
