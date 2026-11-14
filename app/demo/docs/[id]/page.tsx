import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticle, loadArticles } from "@/lib/kb";
import { Markdown } from "@/lib/markdown";

export function generateStaticParams() {
  return loadArticles().map((a) => ({ id: a.id }));
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = getArticle(id);
  if (!article) notFound();

  return (
    <article className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6">
      <Link href="/demo/docs" className="text-xs text-emerald-700 hover:underline">← All help articles</Link>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">{article.category}</p>
      <h1 className="mt-1 text-2xl font-semibold">{article.title}</h1>
      <div className="mt-4 text-sm">
        <Markdown text={article.body} />
      </div>
    </article>
  );
}
