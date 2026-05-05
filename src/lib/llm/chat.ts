import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ZodSchema } from "zod";
import { env } from "@/lib/env";
import { getLLMClient } from "./client";
import { normalizeLLMError } from "./errors";

// ── Public types ──────────────────────────────────────────────────────────────

export type ChatMessage = ChatCompletionMessageParam;

export interface ChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  responseFormat?: { type: "text" | "json_object" };
}

export interface ChatResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  latencyMs: number;
}

/**
 * Structured token-usage log entry emitted after every LLM call.
 * Shape is intentionally flat — maps directly to llm_calls columns.
 *
 * Optional FK fields (article_id, post_id, prompt_id) are backward-compatible:
 * existing callers that don't pass them simply omit them.
 */
export interface UsageLogEntry {
  deployment: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  request_id: string | null;
  // Optional FK references — omit when the call isn't tied to a specific entity
  article_id?: string | null;
  post_id?: string | null;
  prompt_id?: string | null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Fire-and-forget DB insert into llm_calls.
 * Failure is logged but never propagated — usage logging must never crash a call.
 */
async function emitUsageLog(entry: UsageLogEntry): Promise<void> {
  try {
    const { db } = await import("@/db");
    const { llmCalls } = await import("@/db/schema");
    await db.insert(llmCalls).values({
      model: entry.deployment,
      promptTokens: entry.prompt_tokens,
      completionTokens: entry.completion_tokens,
      totalTokens: entry.total_tokens,
      durationMs: entry.latency_ms,
      ...(entry.article_id != null ? { articleId: entry.article_id } : {}),
      ...(entry.post_id != null ? { postId: entry.post_id } : {}),
      ...(entry.prompt_id != null ? { promptId: entry.prompt_id } : {}),
    });
  } catch (err) {
    console.error("[llm_calls insert failed]", err);
  }
}

// ── chat ─────────────────────────────────────────────────────────────────────

/**
 * One-shot chat completion.  Returns the full content string plus usage stats.
 * Throws AppError (normalised) on any failure.
 */
export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const client = getLLMClient();
  const deployment = env.AZURE_OPENAI_DEPLOYMENT;
  const startMs = Date.now();

  try {
    const response = await client.chat.completions.create({
      model: deployment,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      ...(opts.responseFormat
        ? { response_format: { type: opts.responseFormat.type } }
        : {}),
    });

    const latencyMs = Date.now() - startMs;
    const choice = response.choices[0];

    if (!choice?.message?.content) {
      throw new Error(
        `No content in LLM response (finish_reason: ${choice?.finish_reason ?? "unknown"})`,
      );
    }

    // Content-filter finish_reason surfaces here (not as an HTTP error).
    if (choice.finish_reason === "content_filter") {
      const { AppError } = await import("./errors");
      throw new AppError(
        "Response blocked by Azure content filter",
        "content_filter",
      );
    }

    const usage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    void emitUsageLog({
      deployment,
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      total_tokens: usage.totalTokens,
      latency_ms: latencyMs,
      request_id: response.id ?? null,
    });

    return {
      content: choice.message.content,
      usage,
      model: response.model ?? deployment,
      latencyMs,
    };
  } catch (err) {
    throw normalizeLLMError(err);
  }
}

// ── chatStream ────────────────────────────────────────────────────────────────

/**
 * Streaming chat completion.  Yields content delta strings as they arrive.
 * Usage stats are emitted via the usage log after the stream completes.
 *
 * Downstream draft generation (WI-09) should consume this as:
 *   for await (const chunk of chatStream({ messages })) { ... }
 */
export async function* chatStream(
  opts: Omit<ChatOptions, "responseFormat">,
): AsyncGenerator<string, void, unknown> {
  const client = getLLMClient();
  const deployment = env.AZURE_OPENAI_DEPLOYMENT;
  const startMs = Date.now();

  try {
    const stream = await client.chat.completions.create({
      model: deployment,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      stream: true,
      stream_options: { include_usage: true },
    });

    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let requestId: string | null = null;

    for await (const chunk of stream) {
      if (!requestId && chunk.id) requestId = chunk.id;

      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;

      // The final chunk carries usage when stream_options.include_usage is set.
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? 0;
        completionTokens = chunk.usage.completion_tokens ?? 0;
        totalTokens = chunk.usage.total_tokens ?? 0;
      }
    }

    void emitUsageLog({
      deployment,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      latency_ms: Date.now() - startMs,
      request_id: requestId,
    });
  } catch (err) {
    throw normalizeLLMError(err);
  }
}

// ── chatJSON ──────────────────────────────────────────────────────────────────

/**
 * JSON-mode completion validated against a Zod schema.
 *
 * Why Zod over raw JSON.parse?
 * - The LLM can hallucinate extra fields or wrong types even in JSON mode.
 * - Zod parse gives us typed output AND a descriptive error if the shape
 *   is wrong — surfacing schema drift early rather than at runtime downstream.
 * - Callers (scoring, timing) get back a typed object, not `unknown`.
 *
 * The system message injection is intentional: Azure's JSON mode guarantees
 * valid JSON syntax but NOT that the shape matches your schema.  Telling the
 * model what shape you want materially reduces parse failures.
 */
export async function chatJSON<T>(
  opts: ChatOptions & { schema: ZodSchema<T>; schemaDescription?: string },
): Promise<T> {
  const systemHint = opts.schemaDescription
    ? `Respond with valid JSON that matches this schema: ${opts.schemaDescription}`
    : "Respond with valid JSON only. No markdown, no prose.";

  const messagesWithHint: ChatMessage[] = [
    { role: "system", content: systemHint },
    ...opts.messages,
  ];

  const result = await chat({
    messages: messagesWithHint,
    temperature: opts.temperature ?? 0,
    responseFormat: { type: "json_object" },
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.content);
  } catch {
    throw new (await import("./errors")).AppError(
      `LLM returned invalid JSON: ${result.content.slice(0, 200)}`,
      "fatal",
    );
  }

  const validation = opts.schema.safeParse(parsed);
  if (!validation.success) {
    throw new (await import("./errors")).AppError(
      `LLM JSON failed schema validation: ${validation.error.message}`,
      "fatal",
      validation.error,
    );
  }

  return validation.data;
}
