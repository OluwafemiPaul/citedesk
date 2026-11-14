import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { REPO_URL } from "@/lib/config";

const STEPS = [
  { title: "Import your website", body: "Enter your web address. CiteDesk reads your pages and turns them into help articles you review and approve. PDFs and Word files work too." },
  { title: "Connect your AI key", body: "Use your own Anthropic or OpenAI key. You pay the AI provider directly, usually a few dollars a month, and CiteDesk adds no markup." },
  { title: "Add one line to your site", body: "Paste one line of code into Wix, Squarespace, Shopify, WordPress or any site. A chat bubble appears, ready for customers." },
];

const FEATURES = [
  { title: "Every answer shows its source", body: "Customers see which page an answer came from. No source means no guess." },
  { title: "Knows when to call a person", body: "Fraud, account problems, legal threats and requests for a human go straight to your inbox with a summary." },
  { title: "Private by default", body: "Card and ID numbers are removed before anything is processed. Your content is never used to train AI models." },
  { title: "See what customers ask", body: "A dashboard shows questions, what the bot resolved, and which missing articles would help most." },
  { title: "Low, predictable cost", body: "You bring your own AI key, so there is no per message markup." },
  { title: "Open source", body: "The full code is on GitHub under the AGPL license. Self host it for free if you prefer." },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 pb-12 pt-16 text-center">
          <p className="mx-auto mb-4 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
            Now accepting early small businesses, free during the pilot
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
            A support assistant built from your own website, that shows where every answer came from.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            CiteDesk answers customer questions from your pages and documents, cites its sources, and hands hard questions to a person with a ready summary.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/request-access" className="rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700">
              Request free access
            </Link>
            <Link href="/demo" className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium hover:border-indigo-400">
              Try the live demo
            </Link>
          </div>
          <p className="mt-3 text-xs text-slate-500">No credit card. Every account is reviewed by a person.</p>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-center text-2xl font-semibold">Live in about 30 minutes</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-indigo-600 text-sm font-semibold text-white">{i + 1}</div>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-center text-2xl font-semibold">Built for trust, not guesses</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="rounded-2xl bg-indigo-600 p-8 text-center text-white">
            <h2 className="text-2xl font-semibold">Run a shop, clinic, church or service business?</h2>
            <p className="mx-auto mt-2 max-w-xl text-indigo-100">CiteDesk is free during the pilot for a small number of businesses. Tell us about yours.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/request-access" className="rounded-xl bg-white px-5 py-3 font-medium text-indigo-700">Request access</Link>
              <a href={REPO_URL} className="rounded-xl border border-indigo-300 px-5 py-3 font-medium">Developer? Self host it</a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
