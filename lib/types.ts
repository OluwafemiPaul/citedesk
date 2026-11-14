export type Article = {
  id: string;
  title: string;
  category: string;
  body: string;
};

export type Confidence = "high" | "medium" | "low";

export type Ticket = {
  summary: string;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  customerQuestion: string;
};

export type Citation = { id: string; title: string };

export type ChatResponse = {
  answer: string;
  citations: Citation[];
  confidence: Confidence;
  handoff: boolean;
  handoffReason?: string;
  ticket?: Ticket;
  mode: "live" | "demo";
  notice?: string;
  redacted?: boolean;
};

export type ChatMessage = { role: "user" | "assistant"; content: string };
