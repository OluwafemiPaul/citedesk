import { NextResponse } from "next/server";
import { isSupabaseConfigured, SITE_URL } from "@/lib/config";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { platformOwnerEmail } from "@/lib/auth";

export const runtime = "nodejs";

// Only the platform owner and approved businesses get a sign in link (FRD F2.1, F5.1).
// The reply is the same either way, so nobody can use this form to find out who has an account.
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Sign in is not available on this copy yet." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
  const next = typeof body.next === "string" && body.next.startsWith("/") ? body.next : "/app";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });

  let allowed = email === platformOwnerEmail();
  if (!allowed) {
    const { data } = await supabaseAdmin().from("accounts").select("status").ilike("contact_email", email).maybeSingle();
    allowed = data?.status === "approved" || data?.status === "paused";
  }

  if (allowed) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      console.error("signInWithOtp failed", error.message);
      if (error.status === 429) return NextResponse.json({ error: "Too many sign in emails. Please wait a few minutes and try again." }, { status: 429 });
    }
  }
  return NextResponse.json({ ok: true });
}
