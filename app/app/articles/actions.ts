"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/bot";
import { supabaseAdmin } from "@/lib/supabase/server";
import { cleanText, hashText, insertArticles, MAX_BODY, MAX_TITLE, reindex, storageUsed } from "@/lib/articles";

const str = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").slice(0, max);
const STATUSES = ["draft", "approved", "archived"] as const;

// FRD F8.2: write or paste an article.
export async function createArticle(form: FormData) {
  const { account, bot } = await requireBusiness("/app/articles/new");
  const title = str(form, "title", MAX_TITLE);
  const body = str(form, "body", MAX_BODY);
  const status = form.get("approve") ? "approved" : "draft";
  const res = await insertArticles(account, bot.id, [{ title, body, source: "manual", status }]);
  if (res.error) redirect(`/app/articles/new?error=${encodeURIComponent(res.error)}`);
  revalidatePath("/app/articles");
  redirect("/app/articles?saved=1");
}

// FRD F8.4: edit an article; approved changes reach answers immediately.
export async function updateArticle(form: FormData) {
  const { account, bot } = await requireBusiness("/app/articles");
  const id = str(form, "id", 64);
  const title = cleanText(str(form, "title", MAX_TITLE)) || "Untitled";
  const body = cleanText(str(form, "body", MAX_BODY));
  const statusIn = str(form, "status", 20);
  const status = (STATUSES as readonly string[]).includes(statusIn) ? statusIn : "draft";
  const admin = supabaseAdmin();
  const { data: old } = await admin.from("articles").select("title,body").eq("id", id).eq("bot_id", bot.id).single();
  if (!old) redirect("/app/articles");
  if (body.length < 20) redirect(`/app/articles/${id}?error=${encodeURIComponent("Please write at least a sentence.")}`);
  const growth = Buffer.byteLength(title + body) - Buffer.byteLength(old.title + old.body);
  if (growth > 0 && (await storageUsed(account.id)) + growth > account.limits.storage_mb * 1024 * 1024) {
    redirect(`/app/articles/${id}?error=${encodeURIComponent(`This would go over your ${account.limits.storage_mb} MB storage limit.`)}`);
  }
  await admin.from("articles").update({ title, body, status, content_hash: hashText(body), updated_at: new Date().toISOString() }).eq("id", id).eq("bot_id", bot.id);
  await reindex([id]);
  revalidatePath("/app/articles");
  redirect(`/app/articles?saved=1`);
}

// Bulk actions from the article list: approve, move back to draft, archive, delete.
export async function bulkArticles(form: FormData) {
  const { bot } = await requireBusiness("/app/articles");
  const op = str(form, "op", 20);
  const back = str(form, "back", 300) || "/app/articles";
  const admin = supabaseAdmin();
  let ids = form.getAll("ids").map(String).filter((s) => /^[0-9a-f-]{36}$/.test(s)).slice(0, 500);
  if (op === "approve_all_drafts") {
    const { data } = await admin.from("articles").select("id").eq("bot_id", bot.id).eq("status", "draft").limit(1000);
    ids = (data ?? []).map((a) => a.id);
  }
  if (ids.length) {
    if (op === "delete") await admin.from("articles").delete().in("id", ids).eq("bot_id", bot.id);
    else {
      const status = op === "archive" ? "archived" : op === "draft" ? "draft" : "approved";
      for (let i = 0; i < ids.length; i += 100) {
        const part = ids.slice(i, i + 100);
        await admin.from("articles").update({ status, updated_at: new Date().toISOString() }).in("id", part).eq("bot_id", bot.id);
        await reindex(part);
      }
    }
  }
  revalidatePath("/app/articles");
  redirect(back.startsWith("/app/articles") ? back : "/app/articles");
}
