import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Terms of service | CiteDesk" };

// DRAFT: plain language starting point. Have it reviewed before charging customers.
export default function Terms() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-10 text-sm leading-relaxed text-slate-700">
        <h1 className="text-2xl font-semibold text-slate-900">Terms of service</h1>
        <p className="text-xs text-slate-500">Draft for the CiteDesk pilot. Last updated November 13, 2026.</p>
        <p><strong>Pilot service.</strong> CiteDesk is offered free during the pilot, as is, and may change. Access requires approval and can be paused or ended.</p>
        <p><strong>Your content.</strong> You must own or have the right to use the websites and documents you import. You keep ownership of your content.</p>
        <p><strong>Your AI key.</strong> You connect your own AI provider account and are responsible for its charges and terms. Set a spend limit with your provider.</p>
        <p><strong>Answers are not advice.</strong> The assistant answers from your content and may be wrong. It does not give legal, medical or financial advice. Review its answers and keep your content accurate.</p>
        <p><strong>Fair use.</strong> Each account has usage limits. Do not use CiteDesk for spam, illegal content, or to collect sensitive personal data.</p>
        <p><strong>Open source.</strong> The CiteDesk software is licensed under the GNU AGPL version 3. These terms cover the hosted service only.</p>
      </main>
      <SiteFooter />
    </>
  );
}
