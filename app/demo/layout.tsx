import Link from "next/link";

// The original Ledgerly prototype, kept as CiteDesk's public live demo.
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/demo" className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white">L</span>
            <span>Ledgerly Support</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">CiteDesk demo</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/demo" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Chat</Link>
            <Link href="/demo/docs" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Help center</Link>
            <Link href="/demo/admin" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Admin</Link>
            <Link href="/" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Back to CiteDesk</Link>
          </nav>
        </div>
      </header>
      <div className="bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900">
        Ledgerly is a fictional company used to demo CiteDesk. Do not enter real personal or financial information.
      </div>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </>
  );
}
