import React from "react";

// A tiny markdown renderer for the help articles and chat answers.
// It supports paragraphs, bold text, bullet lists, numbered lists and headings.

function inline(text: string, keyBase: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={`${keyBase}-${i}`} className="font-semibold">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={`${keyBase}-${i}`}>{p}</React.Fragment>
    )
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="space-y-3 leading-relaxed">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim() !== "");
        if (lines.every((l) => /^\s*[*-] /.test(l))) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[*-] /, ""), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\s*\d+\. /.test(l))) {
          return (
            <ol key={bi} className="list-decimal space-y-1 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*\d+\. /, ""), `${bi}-${li}`)}</li>
              ))}
            </ol>
          );
        }
        if (/^#{1,3} /.test(lines[0] ?? "")) {
          return (
            <h3 key={bi} className="text-base font-semibold">
              {inline(lines[0].replace(/^#{1,3} /, ""), `${bi}`)}
            </h3>
          );
        }
        // A bold line followed by list items (common in the articles).
        if (lines.length > 1 && /^\*\*[^*]+\*\*$/.test(lines[0]) && lines.slice(1).every((l) => /^\s*([*-]|\d+\.) /.test(l))) {
          const ordered = /^\s*\d+\. /.test(lines[1]);
          const items = lines.slice(1).map((l, li) => <li key={li}>{inline(l.replace(/^\s*([*-]|\d+\.) /, ""), `${bi}-${li}`)}</li>);
          return (
            <div key={bi}>
              <p className="font-semibold">{lines[0].slice(2, -2)}</p>
              {ordered ? <ol className="mt-1 list-decimal space-y-1 pl-5">{items}</ol> : <ul className="mt-1 list-disc space-y-1 pl-5">{items}</ul>}
            </div>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {inline(l, `${bi}-${li}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
