/**
 * Manual smoke test for the Azure OpenAI client wrapper (WI-03).
 *
 * Run with:
 *   AZURE_OPENAI_ENDPOINT=... \
 *   AZURE_OPENAI_API_KEY=... \
 *   AZURE_OPENAI_DEPLOYMENT=... \
 *   DATABASE_URL=postgres://x LINKEDIN_CLIENT_ID=x LINKEDIN_CLIENT_SECRET=x \
 *   LINKEDIN_REDIRECT_URI=http://localhost:3000 \
 *   LINKEDIN_TOKEN_ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
 *   DASHBOARD_PASSWORD=testpass1 APP_BASE_URL=http://localhost:3000 \
 *   npx tsx src/agents/llm.smoke.ts
 *
 * Expected output:
 *   [chat]  content=Hello! ...
 *   [stream] Hello! ... (streamed)
 *   [json]  { greeting: "hello" }
 *   [llm_usage] {...}  ← emitted after each call
 */

import { z } from "zod";
import { chat, chatStream, chatJSON, AppError } from "@/lib/llm";

async function main() {
  console.log("── smoke test: chat ──────────────────────────────");
  const result = await chat({
    messages: [{ role: "user", content: "Say exactly: hello" }],
    temperature: 0,
  });
  console.log("[chat] content =", result.content);
  console.log("[chat] usage   =", result.usage);
  console.log("[chat] latency =", result.latencyMs, "ms");

  console.log("\n── smoke test: chatStream ────────────────────────");
  process.stdout.write("[stream] ");
  for await (const chunk of chatStream({
    messages: [{ role: "user", content: "Count to 5, one word per line." }],
    temperature: 0,
  })) {
    process.stdout.write(chunk);
  }
  console.log("\n[stream] done");

  console.log("\n── smoke test: chatJSON ──────────────────────────");
  const schema = z.object({ greeting: z.string(), language: z.string() });
  const json = await chatJSON({
    messages: [
      {
        role: "user",
        content: 'Return JSON: { "greeting": "hello", "language": "english" }',
      },
    ],
    schema,
    schemaDescription: '{ greeting: string; language: string }',
    temperature: 0,
  });
  console.log("[json]", json);

  console.log("\n── smoke test: error normalization ───────────────");
  try {
    throw new AppError("test auth error", "auth");
  } catch (err) {
    if (err instanceof AppError) {
      console.log("[error] category =", err.category, "| message =", err.message);
    }
  }

  console.log("\n✅ smoke test complete");
}

main().catch((err) => {
  console.error("❌ smoke test failed:", err);
  process.exit(1);
});
