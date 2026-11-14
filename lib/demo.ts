import type { Article, ChatResponse } from "./types";

// Saved answers for the sample questions, so anyone can try the app with no API key.
// Every answer below is written only from the help articles it cites.

export { SAMPLE_QUESTIONS } from "./samples";

type Saved = Omit<ChatResponse, "mode">;

const SAVED: Record<string, Saved> = {
  "when will i get my first payout?": {
    answer:
      "For your first 30 days, payouts arrive **7 business days** after a payment is captured. After 30 days with no unusual activity, that drops to **2 business days**.\n\nA few things that affect timing:\n* Payments captured after 5:00 PM Central count as the next business day.\n* Weekends and US federal holidays push arrival to the next business day.\n\nYou can see each payout's expected arrival date under **Dashboard, then Balances, then Payouts**.",
    citations: [{ id: "payout-schedule", title: "When will I get my payouts?" }],
    confidence: "high",
    handoff: false,
  },
  "how much do you charge for online card payments?": {
    answer:
      "Online card payments cost **2.9% + $0.30** per successful transaction on the Starter plan, which has no monthly fee.\n\n* International cards add 1.5%.\n* Currency conversion adds 1%.\n* On the **Growth plan** ($49 per month), online card pricing drops to **2.6% + $0.30**.\n\nRefunds are free, but the original processing fee is not returned.",
    citations: [{ id: "fees-pricing", title: "Pricing and fees" }],
    confidence: "high",
    handoff: false,
  },
  "a customer filed a chargeback. what do i do?": {
    answer:
      "Here is what to do:\n\n1. Go to **Payments, then Disputes** and open the dispute.\n2. Click **Submit evidence** within **7 days**. Useful evidence includes receipts, shipping tracking and messages with the customer.\n3. Wait for the card issuer's decision, usually within 60 to 75 days.\n\nThe disputed amount plus a $15 fee is held from your balance. If you win, both are returned.\n\nOne important tip: **do not refund a payment that already has a chargeback**. Respond to the dispute instead.",
    citations: [
      { id: "chargebacks", title: "Chargebacks and disputes" },
      { id: "refunds", title: "Issuing refunds to customers" },
    ],
    confidence: "high",
    handoff: false,
  },
  "i lost my business debit card": {
    answer:
      "Sorry about that. Please **freeze the card right away**:\n\n1. Open the Ledgerly app or Dashboard.\n2. Go to **Cards** and select the card.\n3. Click **Freeze card**.\n\nIf you cannot find it, click **Replace card**. The old card is cancelled for good, a new physical card arrives in 7 to 10 business days, and a new virtual card is ready immediately.\n\nIf you see purchases you did not make, tell me and I will connect you with a human agent who can open a card dispute.",
    citations: [{ id: "card-lost", title: "Lost or stolen card" }],
    confidence: "high",
    handoff: false,
  },
  "what documents do you accept to verify my business?": {
    answer:
      "**For people (identity):** a US driver license or state ID, a US or foreign passport, or a US permanent resident card. Photos must be in color, show all four corners and not be expired.\n\n**For the business:** an IRS EIN confirmation letter (CP 575 or 147C), articles of incorporation or organization, or a state or city business license.\n\n**For address:** a utility bill or bank statement from the last 90 days.\n\nUpload files (JPG, PNG or PDF, under 10 MB) under **Settings, then Verification**. Please never send documents by email or chat.",
    citations: [
      { id: "verification-documents", title: "Accepted verification documents" },
      { id: "account-verification", title: "Verifying your business (KYC)" },
    ],
    confidence: "high",
    handoff: false,
  },
  "i think someone logged into my account": {
    answer:
      "Let's secure your account right now:\n\n1. **Reset your password.**\n2. Go to **Settings, then Security** and click **Sign out of all devices**.\n3. **Freeze your cards** under Cards.\n\nI am connecting you with a human agent so they can review your recent activity and pause payouts if needed. Ledgerly will never ask for your password or two factor code.",
    citations: [
      { id: "fraud-phishing", title: "Suspicious activity, phishing and fraud" },
      { id: "two-factor", title: "Two factor authentication and login security" },
    ],
    confidence: "high",
    handoff: true,
    handoffReason: "Possible account takeover or unauthorized activity",
    ticket: {
      summary: "Customer believes someone else accessed their account. Self service security steps shared. Review recent logins and activity, and consider pausing payouts.",
      category: "Security",
      priority: "urgent",
      customerQuestion: "I think someone logged into my account",
    },
  },
};

export function savedAnswer(question: string): Saved | null {
  return SAVED[question.trim().toLowerCase()] ?? null;
}

// When there is no API key, build a simple answer from the best matching article.
export function retrievalOnlyAnswer(question: string, hits: Article[]): Saved {
  if (hits.length === 0) {
    return {
      answer: "I could not find a help article about that. A human agent can help you with this question.",
      citations: [],
      confidence: "low",
      handoff: true,
      handoffReason: "No matching help article",
      ticket: { summary: "No help article matched the question.", category: "General", priority: "normal", customerQuestion: question },
    };
  }
  const top = hits[0];
  const excerpt = top.body.split("\n\n").slice(0, 2).join("\n\n");
  return {
    answer: `This help article looks like the best match:\n\n**${top.title}**\n\n${excerpt}\n\nOpen the cited article for the full details.`,
    citations: hits.slice(0, 2).map((a) => ({ id: a.id, title: a.title })),
    confidence: "medium",
    handoff: false,
  };
}
