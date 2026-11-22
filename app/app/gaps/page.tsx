import Link from "next/link";
import { requireBusiness } from "@/lib/bot";
import { dashboardStats } from "@/lib/stats";
import { formatDateTime } from "@/lib/config";
import { BusinessShell } from "@/components/BusinessShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help center gaps | CiteDesk" };

// FRD F12.4: questions with no source or low confidence, grouped, with one click to write the missing article.
export default async function Gaps() {
  const { me, account } = await requireBusiness("/app/gaps");
  const stats = await dashboardStats(account.id);
  return (
    <BusinessShell me={me}>
      <div>
        <h1 className="text-2xl font-semibold">Help center gaps</h1>
        <p className="text-sm text-slate-600">Questions from the last 30 days that your assistant could not answer well. Writing an article for the most common ones lets it answer next time.</p>
      </div>
      {!stats.gaps.length ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No gaps in the last 30 days.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm">
          {stats.gaps.slice(0, 50).map((g) => (
            <li key={g.key} className="flex flex-wrap items-center gap-3 p-4">
              <span className="min-w-0 flex-1">{g.example}</span>
              <span className="text-xs text-slate-500">asked {g.count} time{g.count === 1 ? "" : "s"} · last {formatDateTime(g.last, false)}</span>
              <Link href={`/app/articles/new?q=${encodeURIComponent(g.example)}`} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white">Write an article</Link>
            </li>
          ))}
        </ul>
      )}
    </BusinessShell>
  );
}
