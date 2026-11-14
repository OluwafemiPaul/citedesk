"use client";

import type { ChatResponse } from "./types";

// Conversation logs for the Admin page. They are kept only in this browser
// (localStorage), so no visitor data is stored on a server.

export type LogEntry = {
  ts: string;
  question: string;
  mode: ChatResponse["mode"];
  confidence: ChatResponse["confidence"];
  handoff: boolean;
  handoffReason?: string;
  citations: string[];
  ticket?: ChatResponse["ticket"];
  sample?: boolean;
};

const KEY = "ledgerly_logs_v1";

export function readLogs(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addLog(entry: LogEntry) {
  try {
    const logs = readLogs();
    logs.push(entry);
    localStorage.setItem(KEY, JSON.stringify(logs.slice(-500)));
  } catch {
    // Storage can be unavailable (private mode). Logging is optional.
  }
}

export function clearLogs() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function saveLogs(logs: LogEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(logs));
  } catch {}
}
