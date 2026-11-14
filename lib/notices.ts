import { supabaseAdmin } from "@/lib/supabase/server";

// In app copy of anything important we tell a business by email (FRD F14 fallback),
// shown on the business dashboard so nothing is lost if an email fails or goes to spam.
export async function addNotice(accountId: string, kind: string, title: string, body: string) {
  try {
    await supabaseAdmin().from("notices").insert({ account_id: accountId, kind, title, body });
  } catch (e) {
    console.error("notice insert failed", e);
  }
}
