// Runs website imports as resumable jobs. Each step processes pages for up to about
// 20 seconds at 1 page per second (FRD F7.3), so it fits serverless time limits.

import { supabaseAdmin } from "@/lib/supabase/server";
import { checkLimit, recordUsage } from "@/lib/limits";
import { cleanText, hashText, MAX_BODY, reindex, storageUsed } from "@/lib/articles";
import { CrawlError, decodeRules, discover, encodeRules, extractPage, robotsAllows, safeFetch } from "@/lib/crawler";
import type { Account, Bot } from "@/lib/bot";

export type ImportJob = {
  id: string;
  domain: string;
  status: "running" | "done" | "failed" | "stopped";
  queue: string[];
  seen: string[];
  disallow: string[];
  page_limit: number;
  pages_imported: number;
  skipped: { url: string; reason: string }[];
  error: string | null;
  created_at: string;
  updated_at: string;
};

const STEP_MS = 20_000;
const DELAY_MS = 1_000;
const MIN_TEXT = 120;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function latestJob(botId: string): Promise<ImportJob | null> {
  const { data } = await supabaseAdmin().from("import_jobs").select("*").eq("bot_id", botId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as ImportJob) ?? null;
}

async function websitePageCount(botId: string) {
  const { count } = await supabaseAdmin().from("articles").select("id", { count: "exact", head: true }).eq("bot_id", botId).eq("source", "website").neq("status", "archived");
  return count ?? 0;
}

export async function startImport(account: Account, bot: Bot, domain: string): Promise<{ job?: ImportJob; error?: string }> {
  const admin = supabaseAdmin();
  const { data: settings } = await admin.from("platform_settings").select("imports_paused").eq("id", 1).single();
  if (settings?.imports_paused) return { error: "Website imports are paused by CiteDesk right now. Please try again later." };
  const { data: verified } = await admin.from("domains").select("verified_at").eq("account_id", account.id).eq("domain", domain).maybeSingle();
  if (!verified?.verified_at) return { error: "Verify that you own this website first." };
  const running = await latestJob(bot.id);
  if (running?.status === "running" && Date.now() - new Date(running.updated_at).getTime() < 120_000) return { job: running };
  const limit = await checkLimit(account.id, "imports", 1);
  if (!limit.allowed) return { error: `You have used all ${account.limits.imports_per_month} website imports for this month. Uploads and written articles still work.` };

  const existing = await websitePageCount(bot.id);
  const pageLimit = Math.max(0, account.limits.pages_per_bot - existing);
  if (pageLimit === 0) return { error: `You already have ${existing} website pages, your plan's limit. Archive some pages to import new ones.` };

  let found;
  try {
    found = await discover(domain, pageLimit);
  } catch (e) {
    return { error: e instanceof CrawlError ? e.message : "Could not read your website. Check that it is online." };
  }
  if (running?.status === "running") await admin.from("import_jobs").update({ status: "stopped" }).eq("id", running.id);
  const { data: job, error } = await admin
    .from("import_jobs")
    .insert({ account_id: account.id, bot_id: bot.id, domain, queue: found.urls, disallow: encodeRules(found.rules), page_limit: pageLimit })
    .select("*")
    .single();
  if (error || !job) return { error: "Could not start the import. Please try again." };
  await recordUsage(account.id, { imports: 1 });
  return { job: job as ImportJob };
}

// Processes the next pages of a job. Safe to call repeatedly; returns the updated job.
export async function runStep(account: Account, bot: Bot, jobId: string): Promise<ImportJob | null> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("import_jobs").select("*").eq("id", jobId).eq("bot_id", bot.id).single();
  const job = data as ImportJob | null;
  if (!job || job.status !== "running") return job;

  const rules = decodeRules(job.disallow);
  const seen = new Set(job.seen);
  const queue = job.queue.filter((u) => !seen.has(u));
  const skipped = [...job.skipped];
  let imported = job.pages_imported;
  const touched: string[] = [];
  const started = Date.now();
  const storageLimit = account.limits.storage_mb * 1024 * 1024;
  let storage = await storageUsed(account.id);
  let finishReason: string | null = null;

  while (queue.length && Date.now() - started < STEP_MS) {
    if (imported >= job.page_limit) {
      finishReason = "limit";
      break;
    }
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    if (!robotsAllows(rules, new URL(url))) {
      skipped.push({ url, reason: "Blocked by your robots.txt" });
      continue;
    }
    const t0 = Date.now();
    try {
      const page = await safeFetch(url, job.domain);
      const finalUrl = page.url.replace(/^http:/, "https:");
      if (page.status !== 200) skipped.push({ url, reason: `Page returned ${page.status}` });
      else if (!/html/i.test(page.contentType)) skipped.push({ url, reason: "Not a web page" });
      else {
        const ex = extractPage(page.body, finalUrl, job.domain);
        for (const l of ex.links) if (!seen.has(l) && !queue.includes(l) && queue.length < job.page_limit * 4) queue.push(l);
        const body = cleanText(ex.text).slice(0, MAX_BODY);
        if (ex.noindex) skipped.push({ url, reason: "Page asks not to be indexed" });
        else if (body.length < MIN_TEXT) skipped.push({ url, reason: "Too little text (it may be built with JavaScript)" });
        else if (finalUrl !== url && seen.has(finalUrl)) skipped.push({ url, reason: "Duplicate of another page" });
        else {
          seen.add(finalUrl);
          const hash = hashText(body);
          const { data: prev } = await admin.from("articles").select("id,content_hash").eq("bot_id", bot.id).eq("source_url", finalUrl).eq("source", "website").maybeSingle();
          const bytes = Buffer.byteLength(ex.title) + Buffer.byteLength(body);
          if (prev?.content_hash === hash) skipped.push({ url, reason: "Already imported, no changes" });
          else if (storage + bytes > storageLimit) {
            finishReason = "storage";
            skipped.push({ url, reason: "Storage limit reached" });
            break;
          } else if (prev) {
            // Changed page: update the text and send it back to draft for review.
            await admin.from("articles").update({ title: ex.title, body, content_hash: hash, status: "draft", updated_at: new Date().toISOString() }).eq("id", prev.id);
            touched.push(prev.id);
            storage += bytes;
          } else {
            const { data: art } = await admin
              .from("articles")
              .insert({ account_id: account.id, bot_id: bot.id, title: ex.title, body, source: "website", source_url: finalUrl, status: "draft", content_hash: hash })
              .select("id")
              .single();
            if (art) {
              imported++;
              storage += bytes;
            }
          }
        }
      }
    } catch (e) {
      skipped.push({ url, reason: e instanceof CrawlError ? e.message : "Could not load the page" });
    }
    const wait = DELAY_MS - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
  }

  if (finishReason === "limit") for (const u of queue.slice(0, 200)) skipped.push({ url: u, reason: "Over your plan's page limit" });
  const done = !queue.length || finishReason !== null;
  if (touched.length) await reindex(touched);
  const added = imported - job.pages_imported;
  const { data: updated } = await admin
    .from("import_jobs")
    .update({
      queue: done ? [] : queue,
      seen: Array.from(seen).slice(-2000),
      skipped: skipped.slice(-400),
      pages_imported: imported,
      status: done ? "done" : "running",
      error: finishReason === "storage" ? "Stopped at your storage limit." : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", "running")
    .select("*")
    .maybeSingle();
  if (added > 0) await recordUsage(account.id, { pages: added });
  return (updated as ImportJob) ?? job;
}
