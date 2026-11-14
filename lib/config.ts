// Central place for settings read from environment variables.
// Values starting with NEXT_PUBLIC_ are safe to show in the browser; the rest stay on the server.

export const REPO_URL = "https://github.com/OluwafemiPaul/citedesk";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
};

export function isSupabaseConfigured() {
  return Boolean(supabaseConfig.url && supabaseConfig.publishableKey);
}

export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

// Time zone for dates shown on server rendered pages (Vercel servers run in UTC).
export const DISPLAY_TIMEZONE = process.env.DISPLAY_TIMEZONE || "America/Chicago";

export function formatDateTime(d: string | Date, withTime = true) {
  return new Date(d).toLocaleString("en-US", {
    timeZone: DISPLAY_TIMEZONE,
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" as const } : {}),
  });
}
