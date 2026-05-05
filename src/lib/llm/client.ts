import { AzureOpenAI } from "openai";
import { env } from "@/lib/env";

let _client: AzureOpenAI | null = null;

/**
 * Returns a singleton AzureOpenAI client constructed from validated env vars.
 *
 * Auth strategy (WI-03): API key when AZURE_OPENAI_API_KEY is present (dev/CI).
 * Managed Identity (DefaultAzureCredential) is a future option — see Spike 3
 * in docs/decisions/2026-05-04-architecture-spikes.md.
 *
 * The singleton is module-level so Next.js warm-module reuse works correctly.
 * In test contexts, call resetLLMClient() between cases to get a fresh instance.
 */
export function getLLMClient(): AzureOpenAI {
  if (_client) return _client;

  if (!env.AZURE_OPENAI_API_KEY) {
    // TODO (WI-03 follow-up): wire DefaultAzureCredential here when running
    // on App Service without an API key.  For now, throw early so misconfigured
    // environments fail loudly rather than silently.
    throw new Error(
      "AZURE_OPENAI_API_KEY is required for API-key auth mode. " +
        "Set it in .env or as an environment variable.",
    );
  }

  _client = new AzureOpenAI({
    endpoint: env.AZURE_OPENAI_ENDPOINT,
    apiKey: env.AZURE_OPENAI_API_KEY,
    apiVersion: env.AZURE_OPENAI_API_VERSION,
    deployment: env.AZURE_OPENAI_DEPLOYMENT,
  });

  return _client;
}

/** Reset the singleton — useful in tests that need a fresh client. */
export function resetLLMClient(): void {
  _client = null;
}
