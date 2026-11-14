import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/config";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string;
  role: "platform_owner" | "business_owner";
  account_id: string | null;
};

export function platformOwnerEmail() {
  return (process.env.PLATFORM_OWNER_EMAIL || "").trim().toLowerCase();
}

// Returns the signed in person's profile, or null. Also makes sure the platform owner
// email always has the platform owner role and links business owners to their account.
export async function currentProfile(): Promise<Profile | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) return null;

  const admin = supabaseAdmin();
  const email = user.email.toLowerCase();
  let { data: profile } = await admin.from("profiles").select("id,email,role,account_id").eq("id", user.id).maybeSingle();
  if (!profile) {
    const ins = await admin.from("profiles").insert({ id: user.id, email }).select("id,email,role,account_id").single();
    profile = ins.data;
  }
  if (!profile) return null;

  const updates: Record<string, unknown> = {};
  if (email === platformOwnerEmail() && profile.role !== "platform_owner") updates.role = "platform_owner";
  if (!profile.account_id && email !== platformOwnerEmail()) {
    const { data: acct } = await admin.from("accounts").select("id").ilike("contact_email", email).maybeSingle();
    if (acct) updates.account_id = acct.id;
  }
  if (Object.keys(updates).length) {
    const up = await admin.from("profiles").update(updates).eq("id", user.id).select("id,email,role,account_id").single();
    if (up.data) profile = up.data;
  }
  return profile as Profile;
}

export async function requireOwner(): Promise<Profile> {
  const p = await currentProfile();
  if (!p) redirect("/login?next=/owner");
  if (p.role !== "platform_owner") redirect("/app");
  return p;
}

export async function requireUser(): Promise<Profile> {
  const p = await currentProfile();
  if (!p) redirect("/login?next=/app");
  return p;
}
