import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// The sign in link from the email lands here. We swap the one time code for a session cookie.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/app";
  const next = nextParam.startsWith("/") ? nextParam : "/app";
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
