// Calls to the business's own AI provider (FRD F6.2 to F6.5, F9.3). Plain fetch, no SDKs,
// so both providers behave the same and nothing depends on SDK version changes.

export type Provider = "anthropic" | "openai";
export const PROVIDERS: { id: Provider; label: string; keyPrefix: string; consoleUrl: string; billingUrl: string }[] = [
  { id: "anthropic", label: "Anthropic (Claude)", keyPrefix: "sk-ant-", consoleUrl: "https://console.anthropic.com/settings/keys", billingUrl: "https://console.anthropic.com/settings/limits" },
  { id: "openai", label: "OpenAI (GPT)", keyPrefix: "sk-", consoleUrl: "https://platform.openai.com/api-keys", billingUrl: "https://platform.openai.com/settings/organization/limits" },
];

// Optional overrides for self hosters behind a proxy or gateway (and for tests).
const ANTHROPIC = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
const OPENAI = (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/$/, "");

export function isProvider(p: unknown): p is Provider {
  return p === "anthropic" || p === "openai";
}

export class ProviderError extends Error {
  constructor(public friendly: string, public status?: number) {
    super(friendly);
  }
}

// Turns provider errors into plain English for business owners (FRD F6.3).
function friendlyError(provider: Provider, status: number, body: string): ProviderError {
  const name = provider === "anthropic" ? "Anthropic" : "OpenAI";
  const lower = body.toLowerCase();
  if (status === 401 || status === 403) return new ProviderError(`${name} did not accept this key. Check you copied the whole key, and that it has not been deleted.`, status);
  if (status === 402 || lower.includes("credit balance") || lower.includes("insufficient_quota") || lower.includes("billing"))
    return new ProviderError(`The key works, but the ${name} account has no credit left or billing is not set up. Add credit in the ${name} console, then test again.`, status);
  if (status === 429) return new ProviderError(`${name} says this key is over its rate or spend limit right now. Wait a minute, or raise the limit in the ${name} console.`, status);
  if (status === 404) return new ProviderError(`This key cannot use the chosen model. Pick another model and test again.`, status);
  if (status >= 500) return new ProviderError(`${name} is having problems right now. Please try again in a few minutes.`, status);
  return new ProviderError(`${name} returned an error (${status}). Please check the key and try again.`, status);
}

async function call(provider: Provider, url: string, apiKey: string, init: RequestInit = {}, timeoutMs = 30000) {
  const headers: Record<string, string> =
    provider === "anthropic"
      ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }
      : { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ProviderError(`Could not reach ${provider === "anthropic" ? "Anthropic" : "OpenAI"}. Please try again.`);
  }
  const text = await res.text();
  if (!res.ok) throw friendlyError(provider, res.status, text);
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError("The provider sent a reply we could not read. Please try again.");
  }
}

export type ModelOption = { id: string; label: string };

const OPENAI_SKIP = /(audio|realtime|transcribe|tts|image|search|embedding|moderation|whisper|dall-e|instruct|codex|computer)/i;

// Lists the chat models this key can use, cheapest sensible default first.
export async function listModels(provider: Provider, apiKey: string): Promise<ModelOption[]> {
  if (provider === "anthropic") {
    const data = await call(provider, `${ANTHROPIC}/v1/models?limit=100`, apiKey);
    const models: ModelOption[] = (data.data ?? []).map((m: { id: string; display_name?: string }) => ({ id: m.id, label: m.display_name || m.id }));
    // Newest first from the API; put the newest Haiku (lowest cost) first.
    return [...models.filter((m) => /haiku/i.test(m.id)), ...models.filter((m) => !/haiku/i.test(m.id))];
  }
  const data = await call(provider, `${OPENAI}/v1/models`, apiKey);
  const models = (data.data ?? [])
    .filter((m: { id: string }) => /^(gpt-|o\d)/i.test(m.id) && !OPENAI_SKIP.test(m.id) && !/\d{4}-\d{2}-\d{2}/.test(m.id))
    .sort((a: { created: number }, b: { created: number }) => (b.created ?? 0) - (a.created ?? 0))
    .map((m: { id: string }) => ({ id: m.id, label: m.id }));
  const cheap = models.filter((m: ModelOption) => /(mini|nano)/i.test(m.id) && /^gpt-/i.test(m.id));
  return [...cheap, ...models.filter((m: ModelOption) => !cheap.includes(m))];
}

// One tiny generation to prove the key can actually answer (has credit, model allowed).
export async function pingModel(provider: Provider, apiKey: string, model: string): Promise<void> {
  if (provider === "anthropic") {
    await call(provider, `${ANTHROPIC}/v1/messages`, apiKey, {
      method: "POST",
      body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: "user", content: "Reply with OK." }] }),
    });
    return;
  }
  await call(provider, `${OPENAI}/v1/chat/completions`, apiKey, {
    method: "POST",
    body: JSON.stringify({ model, max_completion_tokens: 64, messages: [{ role: "user", content: "Reply with OK." }] }),
  });
}

// A forced tool call returning structured JSON, for the answer engine (FRD F9.3).
export type ToolSpec = { name: string; description: string; schema: Record<string, unknown> };
export type Turn = { role: "user" | "assistant"; content: string };

export async function structuredCall(opts: {
  provider: Provider;
  apiKey: string;
  model: string;
  system: string;
  messages: Turn[];
  tool: ToolSpec;
  maxTokens?: number;
}): Promise<{ input: Record<string, unknown>; inputTokens: number; outputTokens: number }> {
  const maxTokens = opts.maxTokens ?? 900;
  if (opts.provider === "anthropic") {
    const data = await call(opts.provider, `${ANTHROPIC}/v1/messages`, opts.apiKey, {
      method: "POST",
      body: JSON.stringify({
        model: opts.model,
        max_tokens: maxTokens,
        system: opts.system,
        messages: opts.messages,
        tools: [{ name: opts.tool.name, description: opts.tool.description, input_schema: opts.tool.schema }],
        tool_choice: { type: "tool", name: opts.tool.name },
      }),
    });
    const block = (data.content ?? []).find((c: { type: string }) => c.type === "tool_use");
    if (!block) throw new ProviderError("The AI did not return a structured reply.");
    return { input: block.input ?? {}, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 };
  }
  const data = await call(opts.provider, `${OPENAI}/v1/chat/completions`, opts.apiKey, {
    method: "POST",
    body: JSON.stringify({
      model: opts.model,
      max_completion_tokens: maxTokens * 3, // room for reasoning models' hidden reasoning
      messages: [{ role: "system", content: opts.system }, ...opts.messages],
      tools: [{ type: "function", function: { name: opts.tool.name, description: opts.tool.description, parameters: opts.tool.schema } }],
      tool_choice: { type: "function", function: { name: opts.tool.name } },
    }),
  });
  const callArgs = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!callArgs) throw new ProviderError("The AI did not return a structured reply.");
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(callArgs);
  } catch {
    throw new ProviderError("The AI returned a reply we could not read.");
  }
  return { input, inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 };
}
