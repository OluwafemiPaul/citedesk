import Link from "next/link";
import { requireBusiness } from "@/lib/bot";
import { supabaseAdmin } from "@/lib/supabase/server";
import { latestJob } from "@/lib/importer";
import { getUsage } from "@/lib/limits";
import { META_NAME, normalizeDomain, VERIFY_FILE } from "@/lib/crawler";
import { BusinessShell } from "@/components/BusinessShell";
import { addDomain, removeDomain } from "./actions";
import { ImportRunner, VerifyButton } from "./ImportClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import your website | CiteDesk" };

export default async function ImportPage() {
  const { me, account, bot } = await requireBusiness("/app/import");
  const admin = supabaseAdmin();
  const [{ data: domains }, job, usage] = await Promise.all([
    admin.from("domains").select("id,domain,token,verified_at,method").eq("account_id", account.id).order("created_at"),
    latestJob(bot.id),
    getUsage(account.id),
  ]);
  const suggested = account.website ? normalizeDomain(account.website) : null;

  return (
    <BusinessShell me={me}>
      <div>
        <Link href="/app/setup?step=2" className="text-sm text-indigo-700 underline">Back to setup</Link>
        <h1 className="mt-2 text-2xl font-semibold">Import your website</h1>
        <p className="text-sm text-slate-600">
          CiteDesk reads your public pages and turns each one into a draft article for you to review. It follows your robots.txt, stays on your website, and reads at most one page per second.
          Your plan: {account.limits.pages_per_bot} pages, {account.limits.imports_per_month} imports a month ({usage.imports} used this month).
        </p>
      </div>

      {!domains?.length && (
        <form action={addDomain} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">1. Your website address</h2>
          <div className="flex flex-wrap gap-2">
            <input name="domain" required defaultValue={suggested ?? ""} placeholder="yourbusiness.com" className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Continue</button>
          </div>
        </form>
      )}

      {domains?.map((d) =>
        d.verified_at ? (
          <section key={d.id} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{d.domain} <span className="ml-2 rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">verified</span></h2>
            </div>
            <ImportRunner domain={d.domain} initialJob={job && job.domain === d.domain ? job : null} />
          </section>
        ) : (
          <section key={d.id} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">2. Prove you own {d.domain}</h2>
              <form action={removeDomain}>
                <input type="hidden" name="id" value={d.id} />
                <button className="text-slate-500 underline">Use a different address</button>
              </form>
            </div>
            <p className="text-slate-600">This stops anyone importing a website that is not theirs. Pick whichever option is easiest for you, then click Verify. You can remove it afterwards.</p>
            <div className="space-y-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="font-medium">Option A: add a tag to your home page (Wix, Squarespace, WordPress, Shopify, Webflow)</p>
                <p className="mt-1 text-slate-600">In your site builder, find the setting for custom code in the page head (often called "Header code", "Code injection" or "Tracking code") and paste:</p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-white p-3 text-xs ring-1 ring-slate-200">{`<meta name="${META_NAME}" content="${d.token}" />`}</pre>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="font-medium">Option B: upload a small file</p>
                <p className="mt-1 text-slate-600">Create a text file named <code>{VERIFY_FILE.slice(1)}</code> containing only <code>{d.token}</code>, and upload it so it opens at https://{d.domain}{VERIFY_FILE}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="font-medium">Option C: add a DNS record (where you bought your domain)</p>
                <p className="mt-1 text-slate-600">Add a TXT record for {d.domain} with the value:</p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-white p-3 text-xs ring-1 ring-slate-200">{`${META_NAME}=${d.token}`}</pre>
              </div>
            </div>
            <VerifyButton id={d.id} />
          </section>
        ),
      )}
    </BusinessShell>
  );
}
