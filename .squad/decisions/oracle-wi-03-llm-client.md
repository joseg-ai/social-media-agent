# Decision: WI-03 LLM Client — Public API Surface & Usage Logging Contract

**Author:** Oracle  
**Date:** 2026-05-05  
**Work item:** WI-03 — Azure OpenAI typed client wrapper  
**Branch:** `squad/wi-03-azure-openai-client`

---

## Public API Surface

All exports live at `src/lib/llm/index.ts` and are importable via `@/lib/llm`.

### Functions

| Function | Signature | Notes |
|----------|-----------|-------|
| `getLLMClient()` | `() → AzureOpenAI` | Singleton; reads `AZURE_OPENAI_*` env vars. API key auth now; MI path stubbed. |
| `resetLLMClient()` | `() → void` | Clears singleton for test isolation. |
| `chat` | `(ChatOptions) → Promise<ChatResult>` | One-shot completion with usage capture. |
| `chatStream` | `(Omit<ChatOptions,'responseFormat'>) → AsyncGenerator<string>` | Delta streaming; usage captured at stream end via `stream_options.include_usage`. |
| `chatJSON<T>` | `(ChatOptions & { schema: ZodSchema<T>, schemaDescription? }) → Promise<T>` | JSON mode + Zod validation → typed result. |
| `normalizeLLMError` | `(unknown) → AppError` | Classifies any thrown value into AppError. |

### Classes / Types

| Export | Description |
|--------|-------------|
| `AppError` | `extends Error`, adds `category: LLMErrorCategory` and `cause: unknown`. |
| `LLMErrorCategory` | `'auth' \| 'ratelimit' \| 'content_filter' \| 'transient' \| 'fatal'` |
| `ChatMessage` | Re-export of `ChatCompletionMessageParam` from openai SDK. |
| `ChatOptions` | `{ messages, temperature?, responseFormat? }` |
| `ChatResult` | `{ content, usage: { promptTokens, completionTokens, totalTokens }, model, latencyMs }` |
| `UsageLogEntry` | Flat log shape for WI-18 (see below). |

---

## Error Category Taxonomy

| Category | HTTP status / trigger | Retry? |
|----------|-----------------------|--------|
| `auth` | 401, 403 | No — fix credentials |
| `ratelimit` | 429 | Yes — exponential backoff |
| `content_filter` | 400 w/ `content_filter` code, or `finish_reason === 'content_filter'` | No — change prompt |
| `transient` | 5xx, network TypeError | Yes — safe to retry |
| `fatal` | all other 4xx, schema validation failure, programming error | No |

---

## Usage Logging Contract (WI-18)

Every LLM call (streaming and non-streaming) calls `emitUsageLog(entry: UsageLogEntry)` in `src/lib/llm/chat.ts`.

**Current implementation:** `console.log("[llm_usage]", JSON.stringify(entry))`

**WI-18 action:** Replace `emitUsageLog` body with an INSERT into `llm_calls`.  The `llm_calls` table columns **must match these key names exactly** to allow a drop-in replacement:

```typescript
interface UsageLogEntry {
  deployment: string;       // AZURE_OPENAI_DEPLOYMENT value
  prompt_tokens: number;    // from response.usage.prompt_tokens
  completion_tokens: number;// from response.usage.completion_tokens
  total_tokens: number;     // from response.usage.total_tokens
  latency_ms: number;       // wall-clock ms from request start to response complete
  request_id: string | null;// response.id from the OpenAI API (nullable)
}
```

**Additional columns Tank may add to `llm_calls`** (not in Oracle's UsageLogEntry):
- `id` — surrogate PK
- `created_at` — server-side timestamp
- `caller` — optional tag identifying which agent made the call (Oracle can pass this later)

---

## env.ts Additions

Added `AZURE_OPENAI_API_VERSION` (type: `string`, default: `"2024-10-21"`).  
All four Azure OpenAI env vars are now:

| Var | Required | Default |
|-----|----------|---------|
| `AZURE_OPENAI_ENDPOINT` | Yes | — |
| `AZURE_OPENAI_DEPLOYMENT` | Yes | — |
| `AZURE_OPENAI_API_VERSION` | No | `"2024-10-21"` |
| `AZURE_OPENAI_API_KEY` | No (optional for MI) | — |

---

## SDK Decision

`openai` v6.36.0 with `AzureOpenAI` constructor. `@azure/openai` rejected — see `docs/decisions/2026-05-04-architecture-spikes.md` Spike 3.
