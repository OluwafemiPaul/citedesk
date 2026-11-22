"use client";

import { useState } from "react";

export function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100">{text}</code>
      <button
        type="button"
        onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="rounded-lg border border-slate-300 px-3 text-sm"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
