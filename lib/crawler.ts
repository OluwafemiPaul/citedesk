// Website import (FRD F7.1 to F7.5): ownership check, page discovery, robots.txt,
// polite fetching that stays on the verified domain, and main content extraction.

import { lookup, resolveTxt } from "node:dns/promises";
import { isIP } from "node:net";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { cleanText } from "@/lib/articles";
import { elementText } from "@/lib/documents";
import { SITE_URL } from "@/lib/config";

export const USER_AGENT = `CiteDeskBot/1.0 (+${SITE_URL})`;
export const META_NAME = "citedesk-verification";
export const VERIFY_FILE = "/citedesk-verification.txt";
const MAX_BYTES = 2_000_000;

export class CrawlError extends Error {}

// "https://www.Example.com/about" -> "example.com"
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (!/^https?:\/\//.test(s)) s = `https://${s}`;
  try {
    const host = new URL(s).hostname.replace(/^www\./, "").replace(/\.$/, "");
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) || isIP(host)) return null;
    if (/(^|\.)(localhost|local|internal|localdomain|home|lan|test|example|invalid)$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

export const onDomain = (url: URL, domain: string) => url.hostname === domain || url.hostname === `www.${domain}`;

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

// Blocks addresses inside private networks, so a domain cannot point CiteDesk at internal servers.
async function assertPublicHost(hostname: string) {
  const addrs = await lookup(hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new CrawlError(`Could not find ${hostname}. Check the address.`);
  if (addrs.some((a) => isPrivateIp(a.address))) throw new CrawlError(`${hostname} points to a private network address, so it cannot be imported.`);
}

export type Fetched = { url: string; status: number; contentType: string; body: string };

// Fetches a URL on the verified domain only, following up to 3 redirects that stay on it.
export async function safeFetch(rawUrl: string, domain: string, accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5"): Promise<Fetched> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    if (!["http:", "https:"].includes(url.protocol) || !onDomain(url, domain)) throw new CrawlError("Link leaves the verified website");
    await assertPublicHost(url.hostname);
    let res: Response;
    try {
      res = await fetch(url, { redirect: "manual", headers: { "user-agent": USER_AGENT, accept }, signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new CrawlError("The page did not respond in time");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    const contentType = res.headers.get("content-type") ?? "";
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new CrawlError("Page is too large");
    const reader = res.body?.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw new CrawlError("Page is too large");
        }
        parts.push(value);
      }
    }
    return { url: url.toString(), status: res.status, contentType, body: Buffer.concat(parts).toString("utf8") };
  }
  throw new CrawlError("Too many redirects");
}

// Ownership check (FRD F7.1): a meta tag on the home page, a small file, or a DNS TXT record.
export async function verifyDomain(domain: string, token: string): Promise<{ ok: boolean; method?: "meta" | "file" | "dns"; detail: string }> {
  const tries: string[] = [];
  for (const host of [domain, `www.${domain}`]) {
    try {
      const home = await safeFetch(`https://${host}/`, domain);
      const { document } = parseHTML(home.body);
      const metas = Array.from(document.querySelectorAll(`meta[name="${META_NAME}"]`)).map((m) => (m as Element).getAttribute("content")?.trim());
      if (metas.includes(token)) return { ok: true, method: "meta", detail: "Found the meta tag on your home page." };
      tries.push(metas.length ? "the meta tag is there but the code does not match" : "no meta tag on the home page");
      break;
    } catch (e) {
      tries.push(e instanceof CrawlError ? e.message : "home page could not be loaded");
    }
  }
  try {
    const file = await safeFetch(`https://${domain}${VERIFY_FILE}`, domain, "text/plain,*/*");
    if (file.status === 200 && file.body.trim().includes(token)) return { ok: true, method: "file", detail: "Found the verification file." };
    tries.push("no verification file");
  } catch {
    tries.push("no verification file");
  }
  try {
    const records = (await resolveTxt(domain)).map((r) => r.join(""));
    if (records.some((r) => r.trim() === `${META_NAME}=${token}`)) return { ok: true, method: "dns", detail: "Found the DNS TXT record." };
    tries.push("no matching DNS TXT record (DNS changes can take up to an hour)");
  } catch {
    tries.push("no matching DNS TXT record (DNS changes can take up to an hour)");
  }
  return { ok: false, detail: `Not verified yet: ${tries.join("; ")}.` };
}

// robots.txt rules for our crawler: groups for CiteDeskBot or *. Longest match wins, Allow beats Disallow on ties.
export type RobotRule = { allow: boolean; path: string };

export function parseRobots(txt: string): { rules: RobotRule[]; sitemaps: string[] } {
  const groups: { agents: string[]; rules: RobotRule[] }[] = [];
  const sitemaps: string[] = [];
  let cur: { agents: string[]; rules: RobotRule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "sitemap") sitemaps.push(val);
    else if (key === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    } else if (cur && (key === "allow" || key === "disallow")) {
      if (val || key === "allow") cur.rules.push({ allow: key === "allow", path: val });
    }
    lastWasAgent = false;
  }
  const mine = groups.filter((g) => g.agents.some((a) => a.includes("citedeskbot")));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return { rules: chosen.flatMap((g) => g.rules).filter((r) => r.path), sitemaps };
}

export function robotsAllows(rules: RobotRule[], url: URL): boolean {
  const path = url.pathname + url.search;
  let best: RobotRule | null = null;
  for (const r of rules) {
    const pattern = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (pattern.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

export const encodeRules = (rules: RobotRule[]) => rules.map((r) => `${r.allow ? "A" : "D"}:${r.path}`);
export const decodeRules = (rows: string[]): RobotRule[] => rows.map((s) => ({ allow: s.startsWith("A:"), path: s.slice(2) }));

const SKIP_EXT = /\.(jpe?g|png|gif|webp|svg|ico|pdf|zip|mp4|mp3|mov|avi|css|js|json|xml|rss|txt|docx?|xlsx?|pptx?|woff2?|ttf|eot)$/i;
const SKIP_PATH = /\/(wp-admin|wp-json|cart|checkout|account|login|signin|signup|register|search|tag|author|feed)(\/|$)/i;

// Normalizes and filters a link: same domain, http(s), no files, fragments or tracking parameters.
export function cleanUrl(href: string, base: string, domain: string): string | null {
  try {
    const u = new URL(href, base);
    if (!["http:", "https:"].includes(u.protocol) || !onDomain(u, domain)) return null;
    if (SKIP_EXT.test(u.pathname) || SKIP_PATH.test(u.pathname)) return null;
    u.hash = "";
    for (const k of Array.from(u.searchParams.keys())) if (/^(utm_|fbclid|gclid|ref$|replytocom|share)/i.test(k)) u.searchParams.delete(k);
    if (u.search.length > 60) return null;
    u.protocol = "https:";
    if (u.pathname !== "/" && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return null;
  }
}

// Reads robots.txt and the sitemap(s). Returns rules and the first URLs to crawl (FRD F7.2, F7.3).
export async function discover(domain: string, max: number): Promise<{ rules: RobotRule[]; urls: string[]; fromSitemap: boolean }> {
  const home = `https://${domain}/`;
  await assertPublicHost(domain).catch(async (e) => {
    // Some sites only answer on www.
    await assertPublicHost(`www.${domain}`).catch(() => {
      throw e;
    });
  });
  let rules: RobotRule[] = [];
  let sitemaps: string[] = [];
  try {
    const r = await safeFetch(`https://${domain}/robots.txt`, domain, "text/plain,*/*");
    if (r.status === 200 && !/html/i.test(r.contentType)) ({ rules, sitemaps } = parseRobots(r.body));
  } catch {
    /* no robots.txt means everything is allowed */
  }
  if (!sitemaps.length) sitemaps = [`https://${domain}/sitemap.xml`, `https://${domain}/sitemap_index.xml`];

  const found = new Set<string>();
  const queue = sitemaps.slice(0, 3);
  let fetched = 0;
  while (queue.length && fetched < 8 && found.size < max * 3) {
    const sm = queue.shift()!;
    fetched++;
    try {
      const r = await safeFetch(sm, domain, "application/xml,text/xml,*/*");
      if (r.status !== 200) continue;
      const locs = Array.from(r.body.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)).map((m) => m[1].replace(/&amp;/g, "&"));
      if (/<sitemapindex/i.test(r.body)) {
        // Page sitemaps first; skip image, video and product feeds when there are others.
        const sorted = locs.sort((a, b) => Number(/(page|post)/i.test(b)) - Number(/(page|post)/i.test(a)));
        queue.push(...sorted.filter((l) => !/(image|video)/i.test(l)).slice(0, 6));
      } else {
        for (const l of locs) {
          const c = cleanUrl(l, home, domain);
          if (c && robotsAllows(rules, new URL(c))) found.add(c);
        }
      }
    } catch {
      /* try the next sitemap */
    }
  }
  // Shorter paths first: home, about, contact, services, then deeper pages.
  const urls = [home, ...Array.from(found).sort((a, b) => new URL(a).pathname.split("/").length - new URL(b).pathname.split("/").length || a.length - b.length)];
  return { rules, urls: Array.from(new Set(urls)).slice(0, max * 3), fromSitemap: found.size > 0 };
}

export type Extracted = { title: string; text: string; links: string[]; noindex: boolean };

// Main content only (FRD F7.4): Readability first, then a cleaned <main> or <body>.
export function extractPage(html: string, url: string, domain: string): Extracted {
  const { document } = parseHTML(html);
  const robotsMeta = (document.querySelector('meta[name="robots"]') as Element | null)?.getAttribute("content") ?? "";
  const links = Array.from(document.querySelectorAll("a[href]"))
    .map((a) => cleanUrl((a as Element).getAttribute("href") ?? "", url, domain))
    .filter((u): u is string => Boolean(u));
  const ogTitle = (document.querySelector('meta[property="og:title"]') as Element | null)?.getAttribute("content");
  const rawTitle = cleanText(ogTitle || document.querySelector("title")?.textContent || "");
  const h1 = cleanText(document.querySelector("h1")?.textContent ?? "");

  let text = "";
  try {
    const clone = parseHTML(html).document;
    const art = new Readability(clone as unknown as Document, { charThreshold: 200 }).parse();
    if (art?.content) {
      const { document: d } = parseHTML(`<!doctype html><html><body>${art.content}</body></html>`);
      text = elementText(d.body as unknown as Element);
    }
  } catch {
    /* fall back below */
  }
  if (text.length < 200) {
    for (const sel of ["script", "style", "noscript", "nav", "header", "footer", "aside", "form", "iframe", "[role=navigation]", "[role=banner]", "[role=contentinfo]", "[aria-hidden=true]", ".cookie", "#cookie", "[class*=cookie]", "[id*=cookie]", "[class*=consent]", "[class*=popup]", "[class*=newsletter]"]) {
      document.querySelectorAll(sel).forEach((n) => (n as Element).remove());
    }
    const main = (document.querySelector("main, [role=main], article, #content, .content") as Element | null) ?? (document.body as unknown as Element);
    const fallback = main ? elementText(main) : "";
    if (fallback.length > text.length) text = fallback;
  }
  // Site name suffixes like "About us | Joe's Bakery" become "About us".
  const title = (rawTitle.split(/\s[|\-–—·]\s/)[0] || h1 || new URL(url).pathname).slice(0, 200);
  return { title, text, links, noindex: /noindex/i.test(robotsMeta) };
}
