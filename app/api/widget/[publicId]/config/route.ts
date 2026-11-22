import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { botByPublicId, hostFrom, isAllowedHost, isLive, OWN_HOST } from "@/lib/widget";

export const runtime = "nodejs";

function cors(origin: string | null, allowed: boolean) {
  return { ...(allowed && origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}), "Cache-Control": "no-store" };
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: { ...cors(origin, true), "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "600" } });
}

// Called by widget.js on the business's site. Returns the bubble's look only for allowed domains
// (FRD F10.6) and records the first successful load as the install check (FRD F6.9).
export async function GET(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const origin = req.headers.get("origin");
  const host = hostFrom(origin) ?? hostFrom(req.headers.get("referer"));
  const bot = await botByPublicId(publicId);
  if (!bot || !isLive(bot)) return NextResponse.json({ error: "not available" }, { status: 404, headers: cors(origin, false) });
  if (!(await isAllowedHost(bot.account_id, host))) return NextResponse.json({ error: "domain not allowed" }, { status: 403, headers: cors(origin, false) });
  if (!bot.installed_at && host && host !== OWN_HOST) {
    await supabaseAdmin().from("bots").update({ installed_at: new Date().toISOString(), installed_on: host }).eq("id", bot.id).is("installed_at", null);
  }
  return NextResponse.json(
    { name: bot.name, color: bot.brand_color, position: bot.bubble_position, logo: bot.logo_url, welcome: bot.welcome_message },
    { headers: cors(origin, true) },
  );
}
