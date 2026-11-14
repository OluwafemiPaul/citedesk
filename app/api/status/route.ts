import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tells the page whether a shared server key is configured. Never returns the key.
export async function GET() {
  return NextResponse.json({ serverKey: Boolean(process.env.ANTHROPIC_API_KEY?.trim()) });
}
