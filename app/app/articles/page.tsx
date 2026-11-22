import Link from "next/link";
import { requireBusiness } from "@/lib/bot";
import { supabaseAdmin } from "@/lib/supabase/server";
import { storageUsed } from "@/lib/articles";
import { BusinessShell } from "@/components/BusinessShell";
import { bulkArticles } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Articles | CiteDesk" };

const SOURCES = { website: "Website", upload: "Upload", manual: "Written" } as const;
const STATUS_STYLE = { draft: "bg-amber-50 text-amber-800", approved: "bg-green-50 text-green-800", archived: "bg-slate-100 text-slate-600" } as const;

// FRD F8.3: article list with search and filters by source and status; F7.6 bulk approve.
export default async function ArticlesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; source?: string; saved?: string }> }) {
  const { me, account, bot } = await requireBusiness("/app/articles");
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const status = ["draft", "approved", "archived"].includes(sp.status ?? "") ? sp.status! : "";
  const source = Object.keys(SOURCES).includes(sp.source ?? "") ? sp.source! : "";

  const admin = supabaseAdmin();
  let query = admin.from("articles").select("id,title,source,source_url,source_name,status,updated_at,body").eq("bot_id", bot.id).order("updated_at", { ascending: false }).limit(300);
  if (status) query = query.eq("status", status);
  else query = query.neq("status", "archived");
  if (source) query = query.eq("source", source);
  if (q) query = query.or(`title.ilike.%${q.replace(/[%,()]/g, " ")}%,body.ilike.%${q.replace(/[%,()]/g, " ")}%`);
  const [{ data: articles }, { count: drafts }, used] = await Promise.all([
    query,
    admin.from("articles").select("id", { count: "exact", head: true }).eq("bot_id", bot.id).eq("status", "draft"),
    storageUsed(account.id),
  ]);
  const back = `/app/articles?${new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(source && { source }) }).toString()}`;
  const filterLink = (k: string, v: string) => `/app/articles?${new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(source && { source }), [k]: v }).toString()}`;

  return (
    <BusinessShell me={me} wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Articles</h1>
          <p className="text-sm text-slate-600">
            Your assistant answers only from approved articles. Storage used: {(used / 1024 / 1024).toFixed(2)} of {account.limits.storage_mb} MB.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/app/import" className="rounded-lg border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">Import website</Link>
          <Link href="/app/articles/upload" className="rounded-lg border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50">Upload files</Link>
          <Link href="/app/articles/new" className="rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white">Write an article</Link>
        </div>
      </div>

      {sp.saved && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900">Saved. Approved articles are used for answers right away.</p>}

      {(drafts ?? 0) > 0 && (
        <form action={bulkArticles} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <span>{drafts} draft article{drafts === 1 ? "" : "s"} waiting for review. Read them first if you can; approved articles are what your assistant tells customers.</span>
          <input type="hidden" name="back" value={back} />
          <button name="op" value="approve_all_drafts" className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white">Approve all drafts</button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search articles" className="w-56 rounded-lg border border-slate-300 px-3 py-1.5" />
          {status && <input type="hidden" name="status" value={status} />}
          {source && <input type="hidden" name="source" value={source} />}
          <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5">Search</button>
        </form>
        <span className="text-slate-500">Status:</span>
        {[["", "Active"], ["draft", "Draft"], ["approved", "Approved"], ["archived", "Archived"]].map(([v, l]) => (
          <Link key={l} href={filterLink("status", v)} className={`rounded-full px-3 py-1 ${status === v ? "bg-indigo-600 text-white" : "bg-white ring-1 ring-slate-200"}`}>{l}</Link>
        ))}
        <span className="text-slate-500">Source:</span>
        {[["", "All"], ...Object.entries(SOURCES)].map(([v, l]) => (
          <Link key={l} href={filterLink("source", v)} className={`rounded-full px-3 py-1 ${source === v ? "bg-indigo-600 text-white" : "bg-white ring-1 ring-slate-200"}`}>{l}</Link>
        ))}
      </div>

      <form action={bulkArticles} className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <input type="hidden" name="back" value={back} />
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 text-sm">
          <span className="text-slate-500">With selected:</span>
          <button name="op" value="approve" className="rounded-lg bg-green-600 px-3 py-1 text-white">Approve</button>
          <button name="op" value="draft" className="rounded-lg border border-slate-300 px-3 py-1">Move to draft</button>
          <button name="op" value="archive" className="rounded-lg border border-slate-300 px-3 py-1">Archive</button>
          <button name="op" value="delete" className="rounded-lg border border-red-300 px-3 py-1 text-red-700">Delete</button>
        </div>
        {!articles?.length ? (
          <p className="p-6 text-sm text-slate-500">No articles here yet. Import your website, upload a file or write one.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="w-8 p-3"><input type="checkbox" name="ids" value={a.id} aria-label={`Select ${a.title}`} /></td>
                  <td className="p-3">
                    <Link href={`/app/articles/${a.id}`} className="font-medium text-slate-900 hover:underline">{a.title}</Link>
                    <p className="mt-0.5 line-clamp-2 text-slate-500">{a.body.slice(0, 220)}</p>
                  </td>
                  <td className="whitespace-nowrap p-3 text-slate-500">
                    {SOURCES[a.source as keyof typeof SOURCES]}
                    {a.source_url && <a href={a.source_url} target="_blank" rel="noreferrer" className="block max-w-56 truncate text-xs text-indigo-700 underline">{a.source_url.replace(/^https?:\/\//, "")}</a>}
                    {a.source_name && <span className="block max-w-56 truncate text-xs">{a.source_name}</span>}
                  </td>
                  <td className="p-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[a.status as keyof typeof STATUS_STYLE]}`}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </form>
    </BusinessShell>
  );
}
