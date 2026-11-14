import type { Article } from "./types";

// A small BM25 keyword search. It needs no extra service or database, which keeps
// the project free to host and easy to run locally. For thousands of documents,
// swap this for embeddings and a vector store.

const STOP = new Set(
  "a an and are as at be by can do does for from how i if in is it its my of on or so that the this to was what when where which who why will with you your me we our get got have has had not no".split(" ")
);

// Map everyday words to the words the help articles use.
const SYNONYMS: Record<string, string[]> = {
  money: ["payout", "balance"],
  paid: ["payout"],
  arrived: ["payout", "delayed"],
  late: ["delayed", "payout"],
  missing: ["delayed"],
  deposit: ["payout"],
  charge: ["fee", "pricing"],
  cost: ["fee", "pricing"],
  price: ["pricing", "fee"],
  dispute: ["chargeback"],
  disputed: ["chargeback"],
  stolen: ["lost", "freeze"],
  hacked: ["suspicious", "fraud", "security"],
  logged: ["login", "suspicious"],
  login: ["password", "security"],
  verify: ["verification", "kyc"],
  id: ["identity", "verification", "documents"],
  wire: ["transfers"],
  send: ["transfer"],
  tax: ["1099k", "taxes"],
  employee: ["team", "role"],
  staff: ["team", "role"],
  bounced: ["returned", "failed"],
  international: ["countries", "currencies"],
};

export function tokenize(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9$%.\s]/g, " ").split(/\s+/);
  const out: string[] = [];
  for (let w of words) {
    w = w.replace(/^[.]+|[.]+$/g, "");
    if (!w || STOP.has(w)) continue;
    const stem = w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w;
    out.push(stem);
    for (const s of SYNONYMS[w] ?? []) out.push(s.length > 4 ? s.replace(/(ing|ed|es|s)$/, "") : s);
  }
  return out;
}

type Index = { docs: { article: Article; tf: Map<string, number>; len: number }[]; df: Map<string, number>; avg: number };
let index: Index | null = null;

function build(articles: Article[]): Index {
  const docs = articles.map((article) => {
    // Titles count three times so a matching title ranks higher.
    const tokens = tokenize(`${article.title} ${article.title} ${article.title} ${article.category} ${article.body}`);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { article, tf, len: tokens.length };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avg = docs.reduce((s, d) => s + d.len, 0) / Math.max(docs.length, 1);
  return { docs, df, avg };
}

export function search(query: string, articles: Article[], k = 4): { article: Article; score: number }[] {
  if (!index || index.docs.length !== articles.length) index = build(articles);
  const q = Array.from(new Set(tokenize(query)));
  const N = index.docs.length;
  const k1 = 1.4;
  const b = 0.75;
  const scored = index.docs.map((d) => {
    let score = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const n = index!.df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / index!.avg)));
    }
    return { article: d.article, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}
