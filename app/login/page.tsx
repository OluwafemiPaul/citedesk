import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in | CiteDesk" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold">Sign in to CiteDesk</h1>
          <p className="mt-1 text-sm text-slate-600">We will email you a sign in link and a code. No password needed.</p>
          {error && <p className="mt-3 text-sm text-red-600">That sign in link did not work. It may have expired, been used already, or opened in a different browser. Request a new email and use the code instead.</p>}
          <LoginForm next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/app"} />
        </div>
        <p className="mt-4 text-center text-sm text-slate-600">
          New here? <a href="/request-access" className="text-indigo-700 underline">Request access</a>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
