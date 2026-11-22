import Link from "next/link";
import { requireBusiness } from "@/lib/bot";
import { BusinessShell } from "@/components/BusinessShell";
import { createArticle } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Write an article | CiteDesk" };

// FRD F8.2: write or paste text.
export default async function NewArticle({ searchParams }: { searchParams: Promise<{ error?: string; q?: string }> }) {
  const { me } = await requireBusiness("/app/articles/new");
  const { error, q } = await searchParams;
  const gap = q?.slice(0, 200);
  return (
    <BusinessShell me={me}>
      <Link href="/app/articles" className="text-sm text-indigo-700 underline">Back to articles</Link>
      <form action={createArticle} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-semibold">Write an article</h1>
        <p className="text-sm text-slate-600">Good for things customers ask that are not on your website. One topic per article works best, for example "Delivery areas and fees".</p>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {gap && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">A customer asked: &ldquo;{gap}&rdquo;. Write the answer below; once approved, your assistant can use it.</p>}
        <input name="title" required maxLength={200} placeholder="Title, for example: Opening hours" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        <textarea name="body" required rows={14} placeholder="Write or paste the details here." className="w-full rounded-lg border border-slate-300 px-3 py-2 leading-relaxed" />
        <div className="flex flex-wrap items-center gap-4">
          <button name="approve" value="1" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Save and approve</button>
          <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Save as draft</button>
        </div>
      </form>
    </BusinessShell>
  );
}
