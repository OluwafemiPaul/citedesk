import { headers } from "next/headers";
import { ChatApp } from "@/components/ChatApp";
import { botByPublicId, hostFrom, isAllowedHost, isLive } from "@/lib/widget";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat", robots: { index: false } };

// The chat window inside the bubble's iframe (FRD F10.1). Isolated from the host site's code and styles.
export default async function Embed({ params, searchParams }: { params: Promise<{ publicId: string }>; searchParams: Promise<{ host?: string; page?: string }> }) {
  const { publicId } = await params;
  const sp = await searchParams;
  const h = await headers();
  const bot = await botByPublicId(publicId);
  // The browser's Referer names the page that holds the iframe; the host parameter is a fallback for sites that hide it.
  const host = hostFrom(h.get("referer")) ?? (sp.host ? sp.host.slice(0, 200) : null);
  const ok = bot && isLive(bot) && (await isAllowedHost(bot.account_id, host));
  if (!bot || !ok) {
    return <p className="p-6 text-sm text-slate-600">This chat is not available on this website.</p>;
  }
  return (
    <div className="h-screen">
      <ChatApp
        publicId={bot.public_id}
        name={bot.name}
        welcome={bot.welcome_message}
        color={bot.brand_color}
        logo={bot.logo_url}
        channel="widget"
        poweredBy={bot.show_powered_by}
        hoursNote={bot.hours_note}
        pageUrl={sp.page ? sp.page.slice(0, 500) : null}
        embedded
      />
    </div>
  );
}
