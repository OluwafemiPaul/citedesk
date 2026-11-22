import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatApp } from "@/components/ChatApp";
import { botBySlug, isLive } from "@/lib/widget";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bot = await botBySlug(slug);
  return { title: bot ? `Help | ${bot.account_name}` : "Help" };
}

// Hosted help page (FRD F10.7): the assistant plus the business's approved articles, at a public link.
export default async function HelpPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bot = await botBySlug(slug);
  if (!bot || bot.account_status !== "approved") notFound();
  const { data: articles } = await supabaseAdmin().from("articles").select("id,title,source_url").eq("bot_id", bot.id).eq("status", "approved").order("title").limit(60);
  const live = isLive(bot);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="text-white" style={{ background: bot.brand_color }}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-5">
          {bot.logo_url && <img src={bot.logo_url} alt="" className="h-10 w-10 rounded-lg bg-white object-cover" />}
          <div>
            <p className="text-xl font-semibold">{bot.account_name.replace(/\s*\(.*?\)\s*/g, " ").trim()}</p>
            <p className="text-sm opacity-90">Help and answers</p>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[1fr_300px]">
        <section className="h-[70vh] min-h-[480px] overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
          {live ? (
            <ChatApp publicId={bot.public_id} name={bot.name} welcome={bot.welcome_message} color={bot.brand_color} logo={null} channel="help" poweredBy={bot.show_powered_by} hoursNote={bot.hours_note} />
          ) : (
            <p className="p-6 text-sm text-slate-600">The assistant is not available right now. Browse the topics instead.</p>
          )}
        </section>
        <aside className="space-y-2">
          <h2 className="font-semibold">Browse topics</h2>
          {!articles?.length ? (
            <p className="text-sm text-slate-500">No topics yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {articles.map((a) => (
                <li key={a.id}>
                  <Link href={`/help/${slug}/a/${a.id}`} className="hover:underline" style={{ color: bot.brand_color }}>{a.title}</Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </main>
    </div>
  );
}
