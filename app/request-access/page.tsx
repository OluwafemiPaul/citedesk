import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { RequestForm } from "./RequestForm";
import { isSupabaseConfigured, turnstileSiteKey } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Request access | CiteDesk" };

async function requestsPaused() {
  if (!isSupabaseConfigured()) return false;
  try {
    const { data } = await supabaseAdmin().from("platform_settings").select("requests_paused").eq("id", 1).single();
    return Boolean(data?.requests_paused);
  } catch {
    return false;
  }
}

export default async function RequestAccessPage() {
  const configured = isSupabaseConfigured();
  const paused = await requestsPaused();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Request access to CiteDesk</h1>
        <p className="mt-2 text-slate-600">
          CiteDesk is free during the pilot. A person reviews every request, usually within 2 business days, and emails you a sign in link once approved.
        </p>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          {!configured ? (
            <p className="text-sm text-slate-600">This copy of CiteDesk is not connected to a database yet. If you are self hosting, add your Supabase settings first (see the README).</p>
          ) : paused ? (
            <p className="text-sm text-slate-600">We are not accepting new requests right now while we onboard current businesses. Please check back soon.</p>
          ) : (
            <RequestForm turnstileSiteKey={turnstileSiteKey} />
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
