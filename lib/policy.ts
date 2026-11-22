// Rules that run before and after the model, so the most important safety
// behavior does not depend on the model getting it right every time.

const CARD_NUMBER = /\b(?:\d[ -]?){13,19}\b/g;
const SSN = /\b\d{3}[ -]?\d{2}[ -]?\d{4}\b/g;

export function redactSensitive(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  const out = text
    .replace(CARD_NUMBER, (m) => {
      redacted = true;
      return "[card number removed]" + (/[\s-]$/.test(m) ? " " : "");
    })
    .replace(SSN, () => {
      redacted = true;
      return "[ID number removed]";
    });
  return { text: out, redacted };
}

type Rule = { pattern: RegExp; reason: string; category: string; priority: "normal" | "high" | "urgent" };

// Situations where a human must take over, whatever the docs say.
export const HANDOFF_RULES: Rule[] = [
  { pattern: /\b(hacked|someone (else )?(logged|accessed|got into)|unauthori[sz]ed|(didn'?t|did not) make|not mine|not me|compromised|account takeover)\b/i, reason: "Possible account takeover or unauthorized activity", category: "Security", priority: "urgent" },
  { pattern: /\b(scam(med)?|stolen money|fraud(ulent)? (charges?|transactions?|activity) on my)\b/i, reason: "Possible fraud", category: "Security", priority: "urgent" },
  { pattern: /\b(lawyer|legal action|sue|attorney|regulator|cfpb|complaint)\b/i, reason: "Legal or regulatory mention", category: "Escalation", priority: "high" },
  { pattern: /\b(my|this|the) (payout|transfer|payment|refund)\b.*\b(po_|tr_|id)\b|\b(po|tr)_[a-z0-9]+/i, reason: "Needs a lookup on a specific transaction", category: "Payouts", priority: "normal" },
  { pattern: /\b(close|frozen|freeze|locked) (my )?account\b.*\b(why|without)\b/i, reason: "Account restriction question", category: "Account", priority: "high" },
  { pattern: /\b(human|real person|live agent|representative|talk to (a|someone)|speak (to|with) (a|someone)|call me)\b/i, reason: "Customer asked for a person", category: "General", priority: "normal" },
];

export function checkHandoff(text: string): Rule | null {
  for (const r of HANDOFF_RULES) if (r.pattern.test(text)) return r;
  return null;
}
