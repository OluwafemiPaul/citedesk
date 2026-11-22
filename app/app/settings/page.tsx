import Link from "next/link";
import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/bot";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { platformOwnerEmail } from "@/lib/auth";
import { BusinessShell } from "@/components/BusinessShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings | CiteDesk" };

// Deletes the business and everything it owns (bots, keys, articles, conversations, tickets) by cascade.
async function deleteAccount(form: FormData) {
  "use server";
  const { me, account } = await requireBusiness("/app/settings");
  if (String(form.get("confirm") ?? "").trim() !== account.name.trim()) redirect("/app/settings?error=name");
  const admin = supabaseAdmin();
  await admin.from("accounts").delete().eq("id", account.id);
  await admin.auth.admin.deleteUser(me.id).catch(() => null);
  const owner = platformOwnerEmail();
  if (owner) await sendEmail({ kind: "account_deleted", to: owner, subject: `CiteDesk: ${account.name} deleted their account`, text: `${account.name} (${account.contact_email}) deleted their account and all its data.` });
  await (await supabaseServer()).auth.signOut().catch(() => null);
  redirect("/?deleted=1");
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { me, account, bot } = await requireBusiness("/app/settings");
  const { error } = await searchParams;
  return (
    <BusinessShell me={me}>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm">
        <h2 className="font-semibold">Assistant</h2>
        <p className="text-slate-600">Name, colors, handoff email, help page address and how long conversations are kept ({bot.retention_days} days) are in <Link href="/app/setup?step=5" className="text-indigo-700 underline">Setup, step 5</Link>. Your AI key is in <Link href="/app/setup?step=1" className="text-indigo-700 underline">step 1</Link>.</p>
      </section>
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm">
        <h2 className="font-semibold">Your data</h2>
        <p className="text-slate-600">Download everything customers asked and every ticket, as spreadsheets.</p>
        <div className="flex gap-2">
          <a href="/api/export?type=conversations" className="rounded-lg border border-slate-300 px-3 py-1.5">Conversations CSV</a>
          <a href="/api/export?type=tickets" className="rounded-lg border border-slate-300 px-3 py-1.5">Tickets CSV</a>
        </div>
      </section>
      <section className="space-y-3 rounded-2xl border border-red-200 bg-white p-6 text-sm">
        <h2 className="font-semibold text-red-800">Delete your account</h2>
        <p className="text-slate-600">This permanently deletes {account.name}, your assistant, your AI key, all articles, conversations and tickets, and your sign in. It cannot be undone. Remove the chat code from your website afterwards.</p>
        <form action={deleteAccount} className="space-y-2">
          <label className="block">Type <strong>{account.name}</strong> to confirm
            <input name="confirm" autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          {error === "name" && <p className="text-red-700">The name did not match.</p>}
          <button className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white">Delete everything</button>
        </form>
      </section>
    </BusinessShell>
  );
}
