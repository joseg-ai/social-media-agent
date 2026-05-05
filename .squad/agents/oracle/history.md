# Project Context

- **Owner:** Jose Guajardo
- **Project:** social-media-agent — agentic LinkedIn auto-poster. Curates from Microsoft RSS feeds + learn.microsoft.com articles. The "smart" requirement: the system must judge *what* is worth posting and *when* the post will land best.
- **Stack:** Next.js 15 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4. LLM provider TBD.
- **Created:** 2026-05-04

## Learnings

### 2026-05-04 — PRD v0.2 approved-pending-Jose; work items documented
- **PRD status:** v0.2 locked, awaiting Jose approval before Wave 1 begins
- **Work items:** 23 tracked at `docs/work-items.md` — you own prompt engineering (draft generation system prompt is at .squad/decisions/decisions.md)
- **IDs you own:** Intelligence wave (prompt design, draft generation, ranking algorithm)
- **Reference:** .squad/decisions/decisions.md contains master prompt (Q7) and all resolved decisions (Q1-Q9)

### 2026-05-05 — WI-03 Azure OpenAI typed client wrapper shipped

**Branch:** `squad/wi-03-azure-openai-client`
**PR:** WI-03: Azure OpenAI typed client wrapper

#### API surface exposed (`@/lib/llm`)

| Export | Kind | Description |
|--------|------|-------------|
| `getLLMClient()` | function | Singleton `AzureOpenAI` client from env vars. API key auth (WI-03 scope); Managed Identity stub left for future. |
| `resetLLMClient()` | function | Clears singleton — test isolation. |
| `chat(opts)` | async fn | One-shot completion → `ChatResult { content, usage, model, latencyMs }` |
| `chatStream(opts)` | async generator | Streaming completion, yields `string` deltas. `stream_options: { include_usage: true }` so usage is captured at stream end. |
| `chatJSON<T>(opts + schema)` | async fn | JSON mode + Zod validation → typed `T`. |
| `AppError` | class | Typed error with `category: LLMErrorCategory`. |
| `normalizeLLMError()` | function | Wraps any thrown value into `AppError`. |
| `LLMErrorCategory` | type | `'auth' \| 'ratelimit' \| 'content_filter' \| 'transient' \| 'fatal'` |
| `ChatMessage`, `ChatOptions`, `ChatResult`, `UsageLogEntry` | types | Public contract types. |

#### Error category taxonomy

- **auth** — HTTP 401/403; bad API key, wrong RBAC on deployment
- **ratelimit** — HTTP 429; TPM/RPM exceeded; callers should back off
- **content_filter** — HTTP 400 with `content_filter` code, OR `finish_reason === 'content_filter'`; not retryable
- **transient** — HTTP 5xx, network TypeError; safe to retry with backoff
- **fatal** — everything else (malformed request, programming errors, schema validation failures)

#### Why JSON mode + Zod (vs raw parse)

Azure JSON mode guarantees valid JSON syntax — not schema conformance.  The LLM can hallucinate extra fields or wrong types.  Zod parse gives us:
1. Typed output at the call site (downstream agents get `T`, not `unknown`)
2. Descriptive validation errors that surface schema drift at dev time, not in prod

We also inject a system message describing the desired shape — materially reduces parse failures even in JSON mode.

#### Usage logging shape (WI-18 contract)

Every call (streaming and non-streaming) emits:
```json
{ "deployment": "...", "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "latency_ms": 0, "request_id": "..." }
```
Currently logged to `console.log("[llm_usage]", ...)`.  WI-18 replaces the `emitUsageLog()` body in `src/lib/llm/chat.ts` with an INSERT into `llm_calls`.  Column names should match the JSON keys exactly.

#### env additions

Added `AZURE_OPENAI_API_VERSION` (default: `"2024-10-21"`) to `src/lib/env.ts`.

