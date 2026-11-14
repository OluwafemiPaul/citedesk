import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CiteDesk | AI support from your own website, with sources",
  description:
    "CiteDesk turns your website and documents into a support assistant that cites every answer and hands hard questions to a person. Bring your own AI key.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
