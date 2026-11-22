import { NextResponse } from "next/server";
import { currentProfile } from "@/lib/auth";
import { canUseResources, getOrCreateBot, type Account } from "@/lib/bot";
import { withDefaults } from "@/lib/limits";
import { supabaseAdmin } from "@/lib/supabase/server";
import { insertArticles } from "@/lib/articles";
import { parseDocx, parsePdf, type Section } from "@/lib/documents";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel rejects request bodies over about 4.5 MB, so one file is capped at 4 MB here.
const HARD_MAX_MB = 4;

// FRD F8.1: upload PDF and Word files; each becomes draft articles split by heading.
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me?.account_id) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const admin = supabaseAdmin();
  const { data: acct } = await admin.from("accounts").select("id,name,website,status,contact_email,limits").eq("id", me.account_id).single();
  if (!acct) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const account = { ...acct, limits: withDefaults(acct.limits) } as Account;
  if (!canUseResources(account)) return NextResponse.json({ error: "Your account is paused, so uploads are turned off." }, { status: 403 });
  const bot = await getOrCreateBot(account.id, account.name);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  const maxMb = Math.min(account.limits.file_mb, HARD_MAX_MB);
  if (file.size > maxMb * 1024 * 1024) return NextResponse.json({ error: `${file.name} is larger than ${maxMb} MB. Split it into smaller files.` }, { status: 413 });

  const name = file.name.slice(0, 200);
  const { data: existing } = await admin.from("articles").select("source_name").eq("bot_id", bot.id).eq("source", "upload").neq("status", "archived");
  const files = new Set((existing ?? []).map((a) => a.source_name));
  if (!files.has(name) && files.size >= account.limits.files) {
    return NextResponse.json({ error: `You have reached your limit of ${account.limits.files} uploaded files. Archive articles from an old file, or ask for a higher limit.` }, { status: 403 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const lower = name.toLowerCase();
  let sections: Section[];
  try {
    if (lower.endsWith(".pdf") || buf.subarray(0, 5).toString() === "%PDF-") sections = await parsePdf(buf, name);
    else if (lower.endsWith(".docx")) sections = await parseDocx(buf, name);
    else return NextResponse.json({ error: `${name}: only PDF and Word (.docx) files are supported. For older .doc files, save as .docx first.` }, { status: 415 });
  } catch (e) {
    console.error("parse failed", name, e);
    return NextResponse.json({ error: `${name} could not be read. If it is a scanned PDF (a picture of text), CiteDesk cannot read it yet.` }, { status: 422 });
  }
  if (!sections.length) return NextResponse.json({ error: `${name} has no readable text. Scanned PDFs (pictures of text) cannot be read yet.` }, { status: 422 });

  const res = await insertArticles(account, bot.id, sections.map((s) => ({ ...s, source: "upload" as const, source_name: name })));
  if (res.error) return NextResponse.json({ error: `${name}: ${res.error}` }, { status: 400 });
  await admin.from("account_events").insert({ account_id: account.id, actor: me.id, event: "file_uploaded", detail: { name, articles: res.inserted } });
  return NextResponse.json({ ok: true, name, articles: res.inserted });
}
