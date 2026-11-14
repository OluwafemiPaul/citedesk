import Link from "next/link";
import { REPO_URL } from "@/lib/config";

export function SiteHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-sm text-white">CD</span>
          <span>CiteDesk</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {right ?? (
            <>
              <Link href="/demo" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Live demo</Link>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="rounded-md px-3 py-1.5 hover:bg-slate-100">GitHub</a>
              <Link href="/login" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Sign in</Link>
              <Link href="/request-access" className="ml-1 rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700">
                Request access
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-slate-500">
      <div className="flex flex-wrap gap-4">
        <span>CiteDesk is open source under the AGPL license.</span>
        <Link href="/privacy" className="hover:underline">Privacy</Link>
        <Link href="/terms" className="hover:underline">Terms</Link>
        <a href={REPO_URL} className="hover:underline">Self host</a>
      </div>
    </footer>
  );
}
