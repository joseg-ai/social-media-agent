/**
 * src/lib/llm — Azure OpenAI typed client wrapper (WI-03)
 *
 * Public API surface (import from "@/lib/llm"):
 *
 *   getLLMClient()        → singleton AzureOpenAI client
 *   resetLLMClient()      → clear singleton (tests)
 *
 *   chat(opts)            → Promise<ChatResult>          one-shot completion
 *   chatStream(opts)      → AsyncGenerator<string>       streaming completion
 *   chatJSON(opts+schema) → Promise<T>                   JSON mode + Zod validation
 *
 *   AppError              typed error class
 *   normalizeLLMError()   wrap SDK throws into AppError
 *
 * Types:
 *   ChatMessage, ChatOptions, ChatResult, UsageLogEntry, LLMErrorCategory
 */

export { getLLMClient, resetLLMClient } from "./client";
export { chat, chatStream, chatJSON } from "./chat";
export { AppError, normalizeLLMError } from "./errors";

export type { LLMErrorCategory } from "./errors";
export type { ChatMessage, ChatOptions, ChatResult, UsageLogEntry } from "./chat";
