import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/bot";
import { supabaseAdmin } from "@/lib/supabase/server";
import { BusinessShell } from "@/components/BusinessShell";
import { bulkArticles, updateArticle } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit article | CiteDesk" };

export default async function EditArticle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { me, bot } = await requireBusiness("/app/articles");
  const { id } = await params;
  const { error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: a } = await supabaseAdmin().from("articles").select("*").eq("id", id).eq("bot_id", bot.id).maybeSingle();
  if (!a) notFound();

  return (
    <BusinessShell me={me}>
      <Link href="/app/articles" className="text-sm text-indigo-700 underline">Back to articles</Link>
      <form action={updateArticle} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <input type="hidden" name="id" value={a.id} />
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <p className="text-xs text-slate-500">
          Source: {a.source === "website" ? "website page" : a.source === "upload" ? `uploaded file ${a.source_name ?? ""}` : "written here"}
          {a.source_url && <> · <a href={a.source_url} target="_blank" rel="noreferrer" className="text-indigo-700 underline">{a.source_url}</a> (answers link here)</>}
        </p>
        <label className="block text-sm font-medium">
          Title
          <input name="title" defaultValue={a.title} maxLength={200} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="block text-sm font-medium">
          Text
          <textarea name="body" defaultValue={a.body} rows={18} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal leading-relaxed" />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <select name="status" defaultValue={a.status} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="draft">Draft (not used for answers)</option>
            <option value="approved">Approved (used for answers)</option>
            <option value="archived">Archived (hidden)</option>
          </select>
          <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Save</button>
        </div>
      </form>
      <form action={bulkArticles} className="text-right">
        <input type="hidden" name="ids" value={a.id} />
        <button name="op" value="delete" className="text-sm text-red-700 underline">Delete this article</button>
      </form>
    </BusinessShell>
  );
}
