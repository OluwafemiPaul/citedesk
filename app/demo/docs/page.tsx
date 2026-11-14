import Link from "next/link";
import { loadArticles } from "@/lib/kb";

export const metadata = { title: "Help center | Ledgerly Support" };

export default function DocsIndex() {
  const articles = loadArticles();
  const byCategory = new Map<string, typeof articles>();
  for (const a of articles) byCategory.set(a.category, [...(byCategory.get(a.category) ?? []), a]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Ledgerly help center</h1>
        <p className="text-sm text-slate-500">The {articles.length} articles the support agent is allowed to answer from.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from(byCategory.entries()).map(([cat, list]) => (
          <div key={cat} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">{cat}</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {list.map((a) => (
                <li key={a.id}>
                  <Link href={`/demo/docs/${a.id}`} className="text-emerald-700 hover:underline">{a.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
