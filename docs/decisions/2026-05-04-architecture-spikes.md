# Architecture Spikes — 2026-05-04

**Decided by:** Morpheus (Technical Lead)
**Date:** 2026-05-04
**Context:** These 4 spikes were blocking Wave 1 coding. Jose approved resolution authority.

---

## Spike 1: ORM Choice — Prisma vs Drizzle vs raw SQL

**Decision:** Drizzle ORM with `drizzle-kit` for migrations.

**Reasoning:**
- Schema is small (7 tables) — Prisma's heavy client generation and binary engine are overkill and hurt cold-start on App Service Basic/Standard tiers.
- Drizzle generates zero runtime overhead beyond the query builder; no binary to download or cache.
- Drizzle's `jsonb` column support is native and type-safe — perfect for scoring breakdowns and timing rationale fields.
- Migrations via `drizzle-kit` are SQL-file-based, inspectable, and work identically in Docker Compose local and Azure DB for PostgreSQL.

**Implications:**
- WI-02 (schema & migrations): Use `drizzle-orm` + `drizzle-kit` + `postgres` (porsager/postgres driver).
- WI-01 (foundation): Add `drizzle.config.ts` to project root, migrations output to `src/db/migrations/`.
- All agents (Tank, Oracle, Trinity) use typed Drizzle schema objects for queries — no raw SQL unless necessary.

**Reversibility:** Easy — Drizzle schemas are just TypeScript; migration files are plain SQL. Swapping to Prisma later means generating a Prisma schema from the existing DB and deleting Drizzle deps. Data stays untouched.

---

## Spike 2: Job Runner — BullMQ vs node-cron vs Azure Functions vs GitHub Actions

**Decision:** `node-cron` in-process for v1, with leader-election guard via Postgres advisory locks.

**Reasoning:**
- Adding Redis (Azure Cache for Redis) for BullMQ is disproportionate for 2 cron jobs at single-instance scale. Costs ~$15/mo minimum and adds operational surface.
- App Service Linux containers are long-running — unlike Vercel, the process doesn't die between requests. `node-cron` works fine here.
- If we scale to multiple instances later, Postgres advisory locks (`pg_try_advisory_lock`) give us leader election without adding infrastructure. Only the instance holding the lock runs the cron.
- GitHub Actions cron has 5-minute minimum granularity and unreliable timing — unacceptable for post scheduling.

**Implications:**
- WI-06 (ingestion scheduler): Implement as `node-cron` job inside the Next.js custom server or instrumentation hook (`instrumentation.ts`).
- WI-11 (post scheduler): Same pattern — cron checks for `scheduled` posts past their `scheduled_for` timestamp.
- WI-22 (deployment): Document that multi-instance requires advisory lock pattern (already built in).

**Reversibility:** Easy — cron jobs are isolated service functions. Moving to BullMQ later means adding Redis, wrapping the same functions as Bull workers, and removing the cron registrations. Zero schema changes.

---

## Spike 3: Azure OpenAI SDK & Auth

**Decision:** Use the `openai` SDK (official, v5+) pointed at Azure endpoint. Dual-mode auth: API key in development, Managed Identity (`@azure/identity` DefaultAzureCredential) in production.

**Reasoning:**
- Microsoft's own guidance (2025+) recommends the `openai` package with `AzureOpenAI` constructor — it supports Azure endpoints natively. The `@azure/openai` package is deprecated.
- Dual-mode is trivial: if `AZURE_OPENAI_API_KEY` is set, use it; otherwise, create a token provider from `DefaultAzureCredential`. One `if` statement in the client factory.
- `langchain` adds 15+ transitive deps and an abstraction layer we don't need — our prompts are simple, and we want direct control over token counting.
- `DefaultAzureCredential` in production means zero secrets for OpenAI in App Service config — tokens auto-rotate.

**Implications:**
- WI-03 (Azure OpenAI service): Build a `createLLMClient()` factory in `src/lib/llm/client.ts`. Accepts mode from env vars. Exports typed wrappers for `chat.completions.create`.
- WI-01 (foundation): `.env.example` includes `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` (optional in prod), `AZURE_OPENAI_DEPLOYMENT`.
- WI-22 (deployment): App Service needs RBAC role "Cognitive Services OpenAI User" on the OpenAI resource.

**Reversibility:** Easy — the `openai` SDK works with both Azure and direct OpenAI. Switching providers means changing the endpoint URL and removing the credential provider. No application code changes beyond the factory.

---

## Spike 4: LinkedIn OAuth Token Storage & Encryption

**Decision:** Application-level AES-256-GCM encryption using Node.js `crypto` module, with the encryption key derived from an environment variable (`LINKEDIN_TOKEN_ENCRYPTION_KEY`).

**Reasoning:**
- Azure Key Vault is architecturally correct for prod secrets but adds ~50-150ms latency per token retrieval, requires additional RBAC setup, and is overkill for a single-user app with one token pair.
- Postgres `pgcrypto` ties encryption to the database layer — harder to test, harder to rotate keys, and token decryption leaks into SQL queries.
- App-level AES-256-GCM with a 32-byte key from env var is simple, fast, testable in isolation, and the standard pattern for encrypting at rest in Node.js apps.
- Key rotation path: add a `key_version` column, decrypt with old key, re-encrypt with new key, update row. Documented in runbook.

**Implications:**
- WI-19 (LinkedIn OAuth): `oauth_tokens` table stores `encrypted_access_token`, `encrypted_refresh_token`, `iv`, `auth_tag`, `key_version`. Encryption/decryption in `src/lib/linkedin/token-crypto.ts`.
- WI-01 (foundation): `.env.example` includes `LINKEDIN_TOKEN_ENCRYPTION_KEY` with generation instructions (`openssl rand -base64 32`).
- WI-22 (deployment): Document that the encryption key must be set as App Service configuration (application setting, not in code).

**Reversibility:** Easy — migrating to Key Vault later means: store the raw tokens as Key Vault secrets, replace the decrypt call with a Key Vault `getSecret` call, and drop the encrypted columns. Data migration is a one-time script.
