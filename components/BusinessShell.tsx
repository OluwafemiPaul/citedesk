import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import type { Profile } from "@/lib/auth";

// Header and page frame for signed in business owners.
export function BusinessShell({ me, children, wide }: { me: Profile; children: React.ReactNode; wide?: boolean }) {
  return (
    <>
      <SiteHeader
        right={
          <form action="/auth/signout" method="post" className="flex flex-wrap items-center justify-end gap-1 text-sm">
            <Link href="/app" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Home</Link>
            <Link href="/app/setup" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Setup</Link>
            <Link href="/app/articles" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Articles</Link>
            <Link href="/app/conversations" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Conversations</Link>
            <Link href="/app/tickets" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Tickets</Link>
            <Link href="/app/settings" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Settings</Link>
            {me.role === "platform_owner" && <Link href="/owner" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Owner</Link>}
            <span className="ml-2 hidden text-xs text-slate-500 md:inline">{me.email}</span>
            <button className="rounded-md px-3 py-1.5 hover:bg-slate-100">Sign out</button>
          </form>
        }
      />
      <main className={`mx-auto ${wide ? "max-w-6xl" : "max-w-4xl"} space-y-6 px-4 py-8`}>{children}</main>
    </>
  );
}
