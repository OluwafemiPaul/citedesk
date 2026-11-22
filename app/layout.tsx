import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CiteDesk | AI support from your own website, with sources",
  description:
    "CiteDesk turns your website and documents into a support assistant that cites every answer and hands hard questions to a person. Bring your own AI key.",
  // Lets this site pass CiteDesk's own ownership check, so it can be imported as a test (set CITEDESK_SITE_VERIFICATION).
  ...(process.env.CITEDESK_SITE_VERIFICATION ? { other: { "citedesk-verification": process.env.CITEDESK_SITE_VERIFICATION } } : {}),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
