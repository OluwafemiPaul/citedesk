import fs from "node:fs";
import path from "node:path";
import type { Article } from "./types";

// Loads every markdown file in /knowledge-base. To use your own company's docs,
// replace these files: each one needs a small header with a title and a category.
const KB_DIR = path.join(process.cwd(), "knowledge-base");

let cache: Article[] | null = null;

export function parseArticle(id: string, raw: string): Article {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const meta: Record<string, string> = {};
  let body = raw;
  if (match) {
    for (const line of match[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    body = match[2].trim();
  }
  return { id, title: meta.title ?? id, category: meta.category ?? "General", body };
}

export function loadArticles(): Article[] {
  if (cache) return cache;
  const files = fs.readdirSync(KB_DIR).filter((f) => f.endsWith(".md")).sort();
  cache = files.map((f) => parseArticle(f.replace(/\.md$/, ""), fs.readFileSync(path.join(KB_DIR, f), "utf8")));
  return cache;
}

export function getArticle(id: string): Article | undefined {
  return loadArticles().find((a) => a.id === id);
}
