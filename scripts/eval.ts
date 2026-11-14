// Offline evaluation for the parts of the agent that do not need an API key:
// 1. Retrieval: is the right help article in the top 3 search results?
// 2. Handoff rules: do security, legal and account specific questions go to a human?
// Run with: npm run eval

import fs from "node:fs";
import path from "node:path";
import { loadArticles } from "../lib/kb";
import { search } from "../lib/retrieval";
import { checkHandoff, redactSensitive } from "../lib/policy";

type Case = { q: string; article: string | null; handoff: boolean };
const cases: Case[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "evals/cases.json"), "utf8"));
const articles = loadArticles();

let retrievalTotal = 0;
let retrievalHits = 0;
let top1 = 0;
let handoffCorrect = 0;
const failures: string[] = [];

for (const c of cases) {
  const results = search(c.q, articles, 3).map((r) => r.article.id);
  if (c.article) {
    retrievalTotal++;
    if (results.includes(c.article)) retrievalHits++;
    else failures.push(`RETRIEVAL  "${c.q}" expected ${c.article}, got [${results.join(", ")}]`);
    if (results[0] === c.article) top1++;
  }
  // The rules are the guaranteed part of handoff. The model can add more handoffs live.
  const ruleHandoff = Boolean(checkHandoff(c.q));
  if (ruleHandoff === c.handoff) handoffCorrect++;
  else failures.push(`HANDOFF    "${c.q}" expected ${c.handoff}, rules gave ${ruleHandoff}`);
}

// Redaction checks
const redactionCases = ["My card is 4242 4242 4242 4242", "SSN 123 45 6789", "card 4000056655665556 got declined"];
const redactionOk = redactionCases.filter((t) => redactSensitive(t).redacted).length;

const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(0)}%`;
console.log("\nLedgerly support agent: offline eval");
console.log("====================================");
console.log(`Retrieval, right article in top 3: ${retrievalHits}/${retrievalTotal} (${pct(retrievalHits, retrievalTotal)})`);
console.log(`Retrieval, right article ranked first: ${top1}/${retrievalTotal} (${pct(top1, retrievalTotal)})`);
console.log(`Handoff rules correct: ${handoffCorrect}/${cases.length} (${pct(handoffCorrect, cases.length)})`);
console.log(`Sensitive number redaction: ${redactionOk}/${redactionCases.length}`);
if (failures.length) {
  console.log("\nMisses:");
  for (const f of failures) console.log("  " + f);
}
console.log("");
