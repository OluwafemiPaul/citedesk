import Link from "next/link";
import { notFound } from "next/navigation";
import { botBySlug } from "@/lib/widget";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function load(slug: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const bot = await botBySlug(slug);
  if (!bot || bot.account_status !== "approved") return null;
  const { data: article } = await supabaseAdmin().from("articles").select("id,title,body,source_url,updated_at").eq("id", id).eq("bot_id", bot.id).eq("status", "approved").maybeSingle();
  return article ? { bot, article } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const r = await load(slug, id);
  return { title: r ? `${r.article.title} | ${r.bot.account_name}` : "Help article" };
}

// Public view of one approved article, so answers from uploads and written articles have a source link.
export default async function HelpArticle({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const r = await load(slug, id);
  if (!r) notFound();
  const { bot, article } = r;
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Link href={`/help/${slug}`} className="text-sm underline" style={{ color: bot.brand_color }}>Back to help</Link>
        <article className="mt-3 rounded-2xl border border-slate-200 bg-white p-6">
          <h1 className="text-2xl font-semibold">{article.title}</h1>
          <p className="mt-1 text-xs text-slate-500">Updated {new Date(article.updated_at).toLocaleDateString("en-US", { dateStyle: "medium" })}</p>
          <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{article.body}</div>
          {article.source_url && <p className="mt-4 text-xs"><a href={article.source_url} className="underline" target="_blank" rel="noreferrer">Original page</a></p>}
        </article>
      </main>
    </div>
  );
}
