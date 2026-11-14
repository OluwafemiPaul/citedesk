// Simple per visitor daily limit for the shared demo key.
// It lives in memory, so it resets when a server instance restarts. That is fine
// for a portfolio demo because the Anthropic Console spend limit is the real cap.
// For production, move this to Redis (for example Upstash) so all instances share it.

const hits = new Map<string, { day: string; count: number }>();

export function allow(ip: string, limit: number): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const rec = hits.get(ip);
  if (!rec || rec.day !== day) {
    hits.set(ip, { day, count: 1 });
    return true;
  }
  if (rec.count >= limit) return false;
  rec.count += 1;
  return true;
}
