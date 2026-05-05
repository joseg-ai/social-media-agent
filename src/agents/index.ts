/**
 * AI agent pipelines (scoring, content generation).
 * Agents call src/lib/llm/* for Azure OpenAI access and
 * src/server/* for persistence — never hit external APIs directly.
 *
 * Available (WI-03+):
 *   import { chat, chatStream, chatJSON, AppError } from "@/lib/llm";
 */
export {};
