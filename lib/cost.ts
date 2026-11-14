import type { Usage } from "@/lib/limits";

// Rough monthly cost estimate for the platform owner (FRD F3.4). AI is excluded because
// every business pays for its own AI key. Unit costs live in platform_settings and can be edited.
export type UnitCosts = {
  per_1000_messages: number;
  per_import: number;
  per_gb_storage_month: number;
  per_1000_emails: number;
};

export const DEFAULT_UNIT_COSTS: UnitCosts = {
  per_1000_messages: 0.05,
  per_import: 0.01,
  per_gb_storage_month: 0.02,
  per_1000_emails: 0.4,
};

export function estimateCost(u: Usage, c: Partial<UnitCosts> | null | undefined): number {
  const k = { ...DEFAULT_UNIT_COSTS, ...(c ?? {}) };
  const usd =
    (u.messages / 1000) * k.per_1000_messages +
    u.imports * k.per_import +
    (u.storage_bytes / 1024 ** 3) * k.per_gb_storage_month +
    (u.handoff_emails / 1000) * k.per_1000_emails;
  return Math.round(usd * 100) / 100;
}

export function formatUsd(n: number) {
  return n < 0.01 && n > 0 ? "< $0.01" : `$${n.toFixed(2)}`;
}
