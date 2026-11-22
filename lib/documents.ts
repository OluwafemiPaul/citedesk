// Turns uploaded PDF and Word files into draft articles split by heading (FRD F8.1).

import { parseHTML } from "linkedom";
import { cleanText } from "@/lib/articles";

export type Section = { title: string; body: string };

const BLOCKS = new Set(["P", "LI", "TR", "BLOCKQUOTE", "PRE", "DIV", "SECTION", "ARTICLE", "TABLE", "UL", "OL", "DL", "DT", "DD", "FIGCAPTION"]);

// Readable text from an HTML element: paragraphs and list items on their own lines.
export function elementText(el: Element): string {
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out.push(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== 1) return;
    const e = node as Element;
    const tag = e.tagName;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "TEMPLATE"].includes(tag)) return;
    if (tag === "BR") out.push("\n");
    if (/^H[1-6]$/.test(tag) || BLOCKS.has(tag)) out.push("\n\n");
    if (tag === "LI") out.push("• ");
    if (tag === "TD" || tag === "TH") out.push(" | ");
    for (const c of Array.from(e.childNodes)) walk(c);
    if (/^H[1-6]$/.test(tag) || BLOCKS.has(tag)) out.push("\n\n");
  };
  walk(el);
  return cleanText(out.join(""));
}

// Splits HTML into sections at h1 to h3 headings.
export function sectionsFromHtml(html: string, fallbackTitle: string): Section[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const sections: Section[] = [];
  let title = fallbackTitle;
  let buf = document.createElement("div");
  const flush = () => {
    const body = elementText(buf);
    if (body.length >= 20) sections.push({ title, body });
    buf = document.createElement("div");
  };
  for (const node of Array.from(document.body.childNodes)) {
    const tag = (node as Element).tagName;
    if (tag && /^H[1-3]$/.test(tag)) {
      flush();
      title = cleanText(node.textContent ?? "").slice(0, 200) || fallbackTitle;
    } else buf.appendChild(node.cloneNode(true));
  }
  flush();
  return mergeTiny(sections);
}

// Plain text (from PDFs) has no heading markup: treat short standalone lines that do not
// end like a sentence as headings; otherwise cut into parts of about 3,000 characters.
export function sectionsFromText(text: string, fallbackTitle: string): Section[] {
  const lines = cleanText(text).split("\n");
  const isHeading = (l: string, next?: string) =>
    l.length >= 3 && l.length <= 70 && !/[.,;:!?]$/.test(l) && /[A-Za-z]/.test(l) && !/^[•\-*\d]+[.)]?\s/.test(l) && (next ?? "").length > l.length && l.split(" ").length <= 10;
  const sections: Section[] = [];
  let title = fallbackTitle;
  let body: string[] = [];
  const flush = () => {
    const b = cleanText(body.join("\n"));
    if (b.length >= 20) sections.push({ title, body: b });
    body = [];
  };
  lines.forEach((l, i) => {
    if (isHeading(l.trim(), lines[i + 1]?.trim())) {
      if (body.join("").trim()) flush();
      title = l.trim();
    } else body.push(l);
  });
  flush();
  const merged = mergeTiny(sections);
  // If headings were not found, split the single long section into parts.
  if (merged.length === 1 && merged[0].body.length > 4000) {
    const parts: Section[] = [];
    let cur = "";
    for (const p of merged[0].body.split(/\n\n+/)) {
      if (cur && cur.length + p.length > 3000) {
        parts.push({ title: `${fallbackTitle} (part ${parts.length + 1})`, body: cur });
        cur = p;
      } else cur = cur ? `${cur}\n\n${p}` : p;
    }
    if (cur) parts.push({ title: `${fallbackTitle} (part ${parts.length + 1})`, body: cur });
    return parts;
  }
  return merged;
}

// Folds sections under 80 characters into the next one so articles are useful on their own.
function mergeTiny(sections: Section[]): Section[] {
  const out: Section[] = [];
  let carry: Section | null = null;
  for (const s of sections) {
    const cur: Section = carry ? { title: carry.title, body: `${carry.body}\n\n${s.title}\n${s.body}` } : s;
    carry = null;
    if (cur.body.length < 80) carry = cur;
    else out.push(cur);
  }
  if (carry) {
    if (out.length) out[out.length - 1].body += `\n\n${carry.title}\n${carry.body}`;
    else out.push(carry);
  }
  return out.slice(0, 100);
}

export async function parseDocx(buf: Buffer, name: string): Promise<Section[]> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml({ buffer: buf });
  return sectionsFromHtml(value, baseName(name));
}

export async function parsePdf(buf: Buffer, name: string): Promise<Section[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return sectionsFromText(Array.isArray(text) ? text.join("\n") : text, baseName(name));
}

export const baseName = (name: string) => name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 150) || "Document";
