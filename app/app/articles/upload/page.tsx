import Link from "next/link";
import { requireBusiness } from "@/lib/bot";
import { BusinessShell } from "@/components/BusinessShell";
import { Uploader } from "./Uploader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Upload files | CiteDesk" };

export default async function UploadPage() {
  const { me, account } = await requireBusiness("/app/articles/upload");
  return (
    <BusinessShell me={me}>
      <Link href="/app/articles" className="text-sm text-indigo-700 underline">Back to articles</Link>
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-semibold">Upload PDF or Word files</h1>
        <p className="text-sm text-slate-600">
          Menus, price lists, policies and FAQs work well. Each file is split into draft articles at its headings, for you to review.
          Up to {Math.min(account.limits.file_mb, 4)} MB per file, {account.limits.files} files in total. Scanned PDFs (pictures of text) cannot be read yet.
        </p>
        <Uploader />
      </section>
    </BusinessShell>
  );
}
