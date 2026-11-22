import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Account } from "@/lib/bot";

export type ArticleSource = "website" | "upload" | "manual";
export type ArticleStatus = "draft" | "approved" | "archived";
export type NewArticle = { title: string; body: string; source: ArticleSource; source_url?: string | null; source_name?: string | null; status?: ArticleStatus };

export const MAX_TITLE = 200;
export const MAX_BODY = 60_000;

export const hashText = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

export function cleanText(s: string) {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Splits an article into overlapping pieces of about 900 characters, on paragraph
// and sentence boundaries, with the title in front of each so search has context (FRD F8.5).
export function chunkText(title: string, body: string, size = 900): string[] {
  const paras = cleanText(body).split(/\n\n+/).flatMap((p) => (p.length <= size ? [p] : p.match(new RegExp(`[^.!?]{1,${size}}[.!?]*\\s*`, "g")) ?? [p]));
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && (cur + "\n\n" + p).length > size) {
      chunks.push(cur);
      const tail = cur.slice(-150);
      cur = tail.includes(" ") ? tail.slice(tail.indexOf(" ") + 1) + "\n\n" + p : p;
    } else cur = cur ? cur + "\n\n" + p : p;
  }
  if (cur.trim()) chunks.push(cur);
  return chunks.map((c) => `${title}\n${c.trim()}`).slice(0, 200);
}

// Rebuilds the search index for articles: approved ones get chunks, others get none.
// Runs on every save, so changes reach answers immediately (FRD F8.4).
export async function reindex(articleIds: string[]) {
  if (!articleIds.length) return;
  const admin = supabaseAdmin();
  await admin.from("chunks").delete().in("article_id", articleIds);
  const { data } = await admin.from("articles").select("id,bot_id,title,body,status").in("id", articleIds).eq("status", "approved");
  const rows = (data ?? []).flatMap((a) => chunkText(a.title, a.body).map((text, ord) => ({ article_id: a.id, bot_id: a.bot_id, ord, text })));
  for (let i = 0; i < rows.length; i += 500) await admin.from("chunks").insert(rows.slice(i, i + 500));
}

export async function storageUsed(accountId: string): Promise<number> {
  const { data } = await supabaseAdmin().rpc("article_storage", { p_account: accountId });
  return Number(data ?? 0);
}

// Checks the storage limit, then inserts drafts (or approved) articles and indexes approved ones.
export async function insertArticles(account: Account, botId: string, items: NewArticle[]): Promise<{ inserted: number; error?: string }> {
  const rows = items
    .map((a) => ({ ...a, title: cleanText(a.title).slice(0, MAX_TITLE) || "Untitled", body: cleanText(a.body).slice(0, MAX_BODY) }))
    .filter((a) => a.body.length >= 20);
  if (!rows.length) return { inserted: 0, error: "No readable text was found." };
  const adding = rows.reduce((n, a) => n + Buffer.byteLength(a.title) + Buffer.byteLength(a.body), 0);
  const limitBytes = account.limits.storage_mb * 1024 * 1024;
  if ((await storageUsed(account.id)) + adding > limitBytes) {
    return { inserted: 0, error: `This would go over your ${account.limits.storage_mb} MB storage limit. Archive or delete some articles, or ask CiteDesk for a higher limit.` };
  }
  const { data, error } = await supabaseAdmin()
    .from("articles")
    .insert(rows.map((a) => ({ account_id: account.id, bot_id: botId, title: a.title, body: a.body, source: a.source, source_url: a.source_url ?? null, source_name: a.source_name ?? null, status: a.status ?? "draft", content_hash: hashText(a.body) })))
    .select("id,status");
  if (error) return { inserted: 0, error: "Could not save the articles. Please try again." };
  await reindex((data ?? []).filter((a) => a.status === "approved").map((a) => a.id));
  return { inserted: data?.length ?? 0 };
}
