import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseConfig } from "@/lib/config";

// Client that acts as the signed in visitor. Row level security applies.
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(supabaseConfig.url, supabaseConfig.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read only. The proxy refreshes them instead.
        }
      },
    },
  });
}

// Client with the secret key. Bypasses row level security, so it must ONLY be used
// in server code after checking who is asking.
export function supabaseAdmin() {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseConfig.url || !secret) throw new Error("Supabase is not configured (missing URL or secret key)");
  return createClient(supabaseConfig.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
