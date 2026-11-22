import { supabaseAdmin } from "@/lib/supabase/server";
import { getKeyStatus, type Bot } from "@/lib/bot";

// The setup wizard steps (FRD F6.1). Steps 5 and 6 arrive in Week 3.
export const STEPS = [
  { n: 1, title: "Connect your AI key", short: "AI key" },
  { n: 2, title: "Add your knowledge", short: "Knowledge" },
  { n: 3, title: "Review your articles", short: "Review" },
  { n: 4, title: "Test your assistant", short: "Test" },
  { n: 5, title: "Customize", short: "Customize" },
  { n: 6, title: "Add it to your website", short: "Install" },
] as const;

export async function getProgress(bot: Bot) {
  const admin = supabaseAdmin();
  const [key, { count: total }, { count: approved }] = await Promise.all([
    getKeyStatus(bot.id),
    admin.from("articles").select("id", { count: "exact", head: true }).eq("bot_id", bot.id).neq("status", "archived"),
    admin.from("articles").select("id", { count: "exact", head: true }).eq("bot_id", bot.id).eq("status", "approved"),
  ]);
  const done: Record<number, boolean> = {
    1: Boolean(key?.last_test_ok && bot.model),
    2: (total ?? 0) > 0,
    3: (approved ?? 0) > 0,
    4: bot.setup_step > 4,
    5: bot.setup_step > 5,
    6: bot.setup_step > 6,
  };
  return { key, total: total ?? 0, approved: approved ?? 0, done, completed: Object.values(done).filter(Boolean).length };
}
