import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Sign in with the code from the email (FRD F2.1). Unlike the link, the code works in any
// browser or device, which fixes phones that open email links in a different browser.
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Sign in is not available on this copy yet." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
  const token = String(body.code ?? "").replace(/\D/g, "");
  const next = typeof body.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//") ? body.next : "/app";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || token.length < 6 || token.length > 10) {
    return NextResponse.json({ error: "Enter the code from your email." }, { status: 400 });
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    if (error.status === 429) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429 });
    return NextResponse.json({ error: "That code is wrong or has expired. Check the newest email, or request a new code." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, next });
}
