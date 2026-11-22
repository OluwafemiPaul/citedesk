import Link from "next/link";
import { SITE_URL } from "@/lib/config";
import type { Bot } from "@/lib/bot";
import { CopyBox } from "./CopyBox";
import { setSetupStep } from "./actions";

const GUIDES: { name: string; steps: string[]; note?: string }[] = [
  { name: "Wix", steps: ["Open your site dashboard and go to Settings.", "Under Advanced, open Custom Code and click Add Custom Code.", "Paste the code, choose All pages, and place it in Body, end.", "Click Apply."], note: "Wix needs a paid plan with a connected domain for custom code." },
  { name: "Squarespace", steps: ["Open Settings, then Advanced (or Developer Tools), then Code Injection.", "Paste the code into the Footer box.", "Click Save."], note: "Code injection needs a paid Squarespace plan." },
  { name: "Shopify", steps: ["Go to Online Store, then Themes.", "On your current theme, click the three dots and choose Edit code.", "Open layout/theme.liquid and paste the code just above the closing </body> tag.", "Click Save."] },
  { name: "WordPress", steps: ["Install the free plugin WPCode (Insert Headers and Footers) from Plugins, Add New.", "Go to Code Snippets, then Header and Footer.", "Paste the code into the Footer box and click Save Changes."], note: "On WordPress.com, plugins need the Business plan or higher." },
  { name: "Webflow", steps: ["Open Site settings, then Custom code.", "Paste the code into Footer code and click Save.", "Publish your site."], note: "Custom code needs a paid Webflow site plan." },
  { name: "Any other website", steps: ["Paste the code just above the closing </body> tag on every page, or in your site's shared footer template.", "Publish or upload the change."] },
];

// FRD F6.8 and F6.9: the one line snippet, platform guides and the install check.
export function InstallStep({ bot, domains }: { bot: Bot; domains: string[] }) {
  const snippet = `<script src="${SITE_URL}/widget.js" data-bot="${bot.public_id}" defer></script>`;
  const helpUrl = `${SITE_URL}/help/${bot.slug}`;
  return (
    <div className="space-y-5 text-sm">
      <div className={`rounded-xl border p-4 ${bot.installed_at ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50"}`}>
        {bot.installed_at ? (
          <p><strong>Installed.</strong> The chat bubble loaded on {bot.installed_on} on {new Date(bot.installed_at).toLocaleDateString("en-US", { dateStyle: "medium" })}. Setup is complete.</p>
        ) : (
          <p><strong>Not detected yet.</strong> After you add the code, open your website once; this page will show it as installed when you refresh.</p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">1. Copy this code</h3>
        <CopyBox text={snippet} />
        <p className="text-slate-600">
          The bubble only appears on websites you have verified: {domains.length ? <strong>{domains.join(", ")}</strong> : <strong>none yet</strong>}.{" "}
          <Link href="/app/import" className="text-indigo-700 underline">{domains.length ? "Add another website" : "Verify your website"}</Link> (the same quick check as the website import).
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">2. Paste it into your website</h3>
        <div className="space-y-2">
          {GUIDES.map((g) => (
            <details key={g.name} className="rounded-xl border border-slate-200 p-3">
              <summary className="cursor-pointer font-medium">{g.name}</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-700">{g.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              {g.note && <p className="mt-2 text-xs text-slate-500">{g.note}</p>}
            </details>
          ))}
        </div>
        <p className="text-xs text-slate-500">Menu names change from time to time; if a step looks different, search your site builder's help for "custom code" or "footer code".</p>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold">No website, or want a link too?</h3>
        <p className="text-slate-600">Your assistant also has its own help page. Share it on social media, in emails, or as a QR code at your counter.</p>
        <CopyBox text={helpUrl} />
        <div className="flex flex-wrap gap-3">
          <a href={helpUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5">Open my help page</a>
          <a href={`${SITE_URL}/try/${bot.public_id}`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5">See the bubble on a sample page</a>
          {!bot.installed_at && bot.setup_step <= 6 && (
            <form action={async () => { "use server"; await setSetupStep(7); }}>
              <button className="rounded-lg border border-slate-300 px-3 py-1.5">I will use the help page: finish setup</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
