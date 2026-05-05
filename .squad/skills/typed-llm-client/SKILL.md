# SKILL: Typed LLM Client with Error Normalization (openai SDK + AzureOpenAI)

## Context

When wrapping the `openai` SDK's `AzureOpenAI` client for use across multiple agents, you need:
1. A singleton factory with env-driven config
2. Typed helpers for one-shot, streaming, and JSON-mode completions
3. Consistent error classification so callers can decide retry vs abort vs surface
4. Usage telemetry hooks decoupled from the transport layer

## Pattern

### 1. Singleton factory (`client.ts`)

```typescript
import { AzureOpenAI } from "openai";
import { env } from "@/lib/env";

let _client: AzureOpenAI | null = null;

export function getLLMClient(): AzureOpenAI {
  if (_client) return _client;
  if (!env.AZURE_OPENAI_API_KEY) throw new Error("API key required");
  _client = new AzureOpenAI({
    endpoint: env.AZURE_OPENAI_ENDPOINT,
    apiKey: env.AZURE_OPENAI_API_KEY,
    apiVersion: env.AZURE_OPENAI_API_VERSION,
    deployment: env.AZURE_OPENAI_DEPLOYMENT,
  });
  return _client;
}

export function resetLLMClient(): void { _client = null; } // test isolation
```

### 2. Error normalization (`errors.ts`)

Define a discriminated union of error categories:

```typescript
export type LLMErrorCategory =
  | "auth"           // 401/403
  | "ratelimit"      // 429
  | "content_filter" // Azure content policy
  | "transient"      // 5xx, network errors — safe to retry
  | "fatal";         // everything else

export class AppError extends Error {
  constructor(
    message: string,
    public readonly category: LLMErrorCategory,
    public readonly cause?: unknown,
  ) { super(message); this.name = "AppError"; }
}

export function normalizeLLMError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (isAPIError(err)) {
    if (err.status === 401 || err.status === 403) return new AppError(err.message, "auth", err);
    if (err.status === 429) return new AppError(err.message, "ratelimit", err);
    if (err.status === 400 && err.message.includes("content_filter"))
      return new AppError(err.message, "content_filter", err);
    if ((err.status ?? 0) >= 500) return new AppError(err.message, "transient", err);
    return new AppError(err.message, "fatal", err);
  }
  if (err instanceof TypeError && err.message.includes("fetch"))
    return new AppError(err.message, "transient", err);
  return new AppError(String(err), "fatal", err);
}
```

### 3. One-shot chat with usage instrumentation

```typescript
export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const startMs = Date.now();
  try {
    const response = await client.chat.completions.create({
      model: deployment, messages: opts.messages, temperature: opts.temperature ?? 0.7,
      ...(opts.responseFormat ? { response_format: { type: opts.responseFormat.type } } : {}),
    });
    const latencyMs = Date.now() - startMs;
    emitUsageLog({ deployment, ...response.usage, latency_ms: latencyMs, request_id: response.id });
    return { content: response.choices[0].message.content!, usage: ..., model: response.model, latencyMs };
  } catch (err) { throw normalizeLLMError(err); }
}
```

### 4. Streaming with end-of-stream usage capture

```typescript
export async function* chatStream(opts): AsyncGenerator<string> {
  const stream = await client.chat.completions.create({
    ...opts, stream: true,
    stream_options: { include_usage: true }, // usage arrives on final chunk
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
    if (chunk.usage) { /* capture for emitUsageLog after loop */ }
  }
  emitUsageLog({ ... });
}
```

Key: `stream_options: { include_usage: true }` makes Azure send a terminal chunk with usage stats.

### 5. JSON mode + Zod validation

```typescript
export async function chatJSON<T>(opts & { schema: ZodSchema<T> }): Promise<T> {
  const result = await chat({ ...opts, responseFormat: { type: "json_object" } });
  const parsed = JSON.parse(result.content); // can throw → AppError fatal
  const validation = opts.schema.safeParse(parsed);
  if (!validation.success) throw new AppError("Schema mismatch", "fatal", validation.error);
  return validation.data;
}
```

**Why Zod over raw parse:** JSON mode guarantees valid JSON syntax, not schema conformance.
Zod gives typed output and surfaces schema drift at call time, not deep in downstream logic.

### 6. Usage telemetry hook (for future DB persistence)

```typescript
function emitUsageLog(entry: UsageLogEntry): void {
  // TODO (WI-18): replace with DB INSERT into llm_calls
  console.log("[llm_usage]", JSON.stringify(entry));
}
```

The `UsageLogEntry` shape is the contract — the DB table column names should match exactly so the replacement is a single-function swap.

## env vars required

```
AZURE_OPENAI_ENDPOINT    = https://<resource>.openai.azure.com
AZURE_OPENAI_DEPLOYMENT  = <deployment-name>
AZURE_OPENAI_API_VERSION = 2024-10-21   # stable GA
AZURE_OPENAI_API_KEY     = <key>         # optional if using Managed Identity
```

## Verified in

- `openai` SDK v6.36.0, Next.js 15.5.3, TypeScript 5 strict mode
- `npx tsc --noEmit` ✓  `npm run lint` ✓
- See PR WI-03: `squad/wi-03-azure-openai-client`
