import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";
import { sendEmail } from "@/lib/email";
import { platformOwnerEmail } from "@/lib/auth";
import { isSupabaseConfigured, SITE_URL } from "@/lib/config";

export const runtime = "nodejs";

const PAGE_MAP: Record<string, number> = { "Under 20": 20, "20 to 50": 50, "50 to 200": 200, "Over 200": 500 };
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Requests are not available on this copy yet." }, { status: 503 });

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Bots fill the hidden field; pretend success so they learn nothing.
  if (clean(b.company_fax, 50)) return NextResponse.json({ ok: true });

  const business_name = clean(b.business_name, 120);
  const contact_name = clean(b.contact_name, 120);
  const email = clean(b.email, 200).toLowerCase();
  let website = clean(b.website, 300);
  const business_type = clean(b.business_type, 60);
  const page_estimate = PAGE_MAP[clean(b.page_estimate, 20)] ?? null;
  const use_case = clean(b.use_case, 1000);

  if (!business_name || !contact_name || !email) return NextResponse.json({ error: "Please fill in the required fields." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  if (website) {
    try {
      new URL(website);
    } catch {
      return NextResponse.json({ error: "Please enter a valid website address." }, { status: 400 });
    }
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (!(await verifyTurnstile(clean(b["cf-turnstile-response"], 4000), ip))) {
    return NextResponse.json({ error: "The bot check failed. Please try again." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: settings } = await admin.from("platform_settings").select("requests_paused").eq("id", 1).single();
  if (settings?.requests_paused) return NextResponse.json({ error: "New requests are paused right now." }, { status: 403 });

  // Rate limits (FRD F1.4): 3 per email and 5 per IP address per day.
  const since = new Date(Date.now() - 864e5).toISOString();
  const [{ count: byEmail }, { count: byIp }] = await Promise.all([
    admin.from("access_requests").select("id", { count: "exact", head: true }).ilike("email", email).gte("created_at", since),
    admin.from("access_requests").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", since),
  ]);
  if ((byEmail ?? 0) >= 3 || (byIp ?? 0) >= 5) {
    return NextResponse.json({ error: "We already have your request. Please wait for our reply." }, { status: 429 });
  }

  const { data: existing } = await admin.from("accounts").select("status").ilike("contact_email", email).maybeSingle();
  if (existing?.status === "approved") {
    return NextResponse.json({ error: "This email already has an approved account. Please sign in instead." }, { status: 409 });
  }

  const { data: request, error } = await admin
    .from("access_requests")
    .insert({ business_name, contact_name, email, website: website || null, business_type, page_estimate, use_case, ip })
    .select("id")
    .single();
  if (error || !request) {
    console.error("access request insert failed", error);
    return NextResponse.json({ error: "Could not save your request. Please try again." }, { status: 500 });
  }

  await Promise.all([
    sendEmail({
      kind: "request_received",
      to: email,
      subject: "We received your CiteDesk request",
      text: `Hi ${contact_name},\n\nThanks for your interest in CiteDesk for ${business_name}. A person reviews every request, usually within 2 business days. We will email you a sign in link once you are approved.\n\nThe CiteDesk team`,
    }),
    platformOwnerEmail()
      ? sendEmail({
          kind: "owner_new_request",
          to: platformOwnerEmail(),
          replyTo: email,
          subject: `New CiteDesk request: ${business_name}`,
          text: `New access request\n\nBusiness: ${business_name}\nContact: ${contact_name} <${email}>\nWebsite: ${website || "none"}\nType: ${business_type || "not given"}\nPages: ${page_estimate ?? "not given"}\nMost asked questions: ${use_case || "not given"}\nIP: ${ip}\n\nReview it: ${SITE_URL}/owner`,
        })
      : Promise.resolve(),
  ]);

  return NextResponse.json({ ok: true });
}
