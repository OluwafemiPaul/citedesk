import { NextResponse } from "next/server";
import { businessFromSession, canUseResources } from "@/lib/bot";
import { latestJob, runStep, startImport } from "@/lib/importer";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// One endpoint for the import page: start, step (process the next batch) and stop.
export async function POST(req: Request) {
  const ctx = await businessFromSession();
  if (!ctx) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { account, bot, me } = ctx;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "stop") {
    const job = await latestJob(bot.id);
    if (job?.status === "running") await supabaseAdmin().from("import_jobs").update({ status: "stopped", queue: [] }).eq("id", job.id);
    return NextResponse.json({ job: await latestJob(bot.id) });
  }
  if (!canUseResources(account)) return NextResponse.json({ error: "Your account is paused, so imports are turned off." }, { status: 403 });

  if (action === "start") {
    const res = await startImport(account, bot, String(body.domain ?? "").slice(0, 200));
    if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
    await supabaseAdmin().from("account_events").insert({ account_id: account.id, actor: me.id, event: "import_started", detail: { domain: res.job!.domain } });
    return NextResponse.json({ job: res.job });
  }
  if (action === "step") {
    const job = await runStep(account, bot, String(body.jobId ?? "").slice(0, 64));
    if (!job) return NextResponse.json({ error: "Import not found." }, { status: 404 });
    return NextResponse.json({ job });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
