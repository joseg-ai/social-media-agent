/**
 * LLM pricing table — USD per 1 000 tokens.
 *
 * ⚠️  HARDCODED — review periodically when model pricing changes.
 *     Azure OpenAI pricing: https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/
 *     Anthropic pricing:    https://www.anthropic.com/pricing
 */

export const PRICING_USD_PER_1K_TOKENS: Record<
  string,
  { prompt: number; completion: number }
> = {
  "gpt-4o-mini": { prompt: 0.00015, completion: 0.0006 },
  "gpt-4o": { prompt: 0.0025, completion: 0.01 },
  "claude-sonnet-4.6": { prompt: 0.003, completion: 0.015 },
  "claude-haiku-4.5": { prompt: 0.00025, completion: 0.00125 },
  "claude-opus-4.5": { prompt: 0.015, completion: 0.075 },
};

/** Fallback pricing applied to any model not listed above. */
export const DEFAULT_PRICING = { prompt: 0.001, completion: 0.003 };

/**
 * Estimate the USD cost of a single LLM call.
 * Returns 0 if token counts are zero.
 */
export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = PRICING_USD_PER_1K_TOKENS[model] ?? DEFAULT_PRICING;
  return (
    (promptTokens / 1000) * pricing.prompt +
    (completionTokens / 1000) * pricing.completion
  );
}
