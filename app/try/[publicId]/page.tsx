import { notFound } from "next/navigation";
import { botByPublicId } from "@/lib/widget";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat bubble test page | CiteDesk", robots: { index: false } };

// A pretend business website with the real one line snippet, so owners without a site can see the bubble.
export default async function TryBubble({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const bot = await botByPublicId(publicId);
  if (!bot) notFound();
  return (
    <div className="min-h-screen bg-white">
      <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">This is a CiteDesk test page showing how the chat bubble looks on a website. The bubble is in the bottom {bot.bubble_position} corner.</div>
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold">{bot.account_name.replace(/\s*\(.*?\)\s*/g, " ").trim()}</span>
          <nav className="flex gap-4 text-sm text-slate-600"><span>Home</span><span>Menu</span><span>About</span><span>Contact</span></nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-12">
        <h1 className="text-3xl font-semibold">Welcome to {bot.account_name.replace(/\s*\(.*?\)\s*/g, " ").trim()}</h1>
        <p className="max-w-xl text-slate-600">This sample page stands in for your real website. Click the chat bubble to ask a question, the same way your customers will.</p>
        <div className="grid gap-4 pt-6 sm:grid-cols-3">{["Our story", "What we offer", "Visit us"].map((t) => <div key={t} className="h-32 rounded-xl bg-slate-100 p-4 text-sm text-slate-500">{t}</div>)}</div>
      </main>
      {/* The exact snippet businesses paste into their own sites. */}
      <script src="/widget.js" data-bot={bot.public_id} defer />
    </div>
  );
}
