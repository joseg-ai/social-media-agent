/**
 * LLM pricing table — USD per 1 000 tokens.
 *
 * ⚠️  HARDCODED — review periodically when model pricing changes.
 *     Azure OpenAI pricing: https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/
 *
 * Cost estimation pricing keyed on the model identifier stored in `llm_calls.model`.
 *
 * IMPORTANT: `llm_calls.model` is set from `env.AZURE_OPENAI_DEPLOYMENT` — the user's
 * Azure deployment slug, NOT the OpenAI canonical model name. If the deployment is
 * named something other than the canonical name (e.g. "prod-gpt4o"), pricing will
 * fall back to DEFAULT_PRICING and the cost estimate will be wrong.
 *
 * Operators: name your Azure deployment to match the canonical key, OR add an
 * explicit entry below for your deployment slug.
 */
// Add entries here keyed on YOUR Azure deployment slug (env.AZURE_OPENAI_DEPLOYMENT).
// Examples below use the OpenAI canonical names assuming the deployment was named to match.
export const PRICING_USD_PER_1K_TOKENS: Record<
  string,
  { prompt: number; completion: number }
> = {
  "gpt-4o-mini": { prompt: 0.00015, completion: 0.0006 },
  "gpt-4o": { prompt: 0.0025, completion: 0.01 },
};

/** Conservative fallback for any unrecognised deployment slug. Intentionally above GPT-4o rates so unknown models err toward over-reporting cost rather than under. */
export const DEFAULT_PRICING = { prompt: 0.005, completion: 0.015 };

/**
 * Estimate the USD cost of a single LLM call.
 * Returns 0 if token counts are zero.
 *
 * NOTE: `model` must match a key in `PRICING_USD_PER_1K_TOKENS`. When using Azure OpenAI,
 * this value comes from `env.AZURE_OPENAI_DEPLOYMENT` (the deployment slug). If it does not
 * match a key, DEFAULT_PRICING is used and the estimate may be inaccurate.
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
