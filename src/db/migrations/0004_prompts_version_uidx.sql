-- WI-16: Prompt editor — unique constraint on (name, prompt_type, version)
-- Backstop for the transactional version-save race fix in createPromptVersion.
-- The application layer now computes MAX(version)+1 inside the transaction;
-- this index ensures Postgres rejects any duplicate that slips through the
-- narrow window between two concurrent MAX reads (error 23505, retried up to 3x).
-- Additive only — no existing rows are affected (seed data has no duplicates).

CREATE UNIQUE INDEX "prompts_name_type_version_uidx" ON "prompts" USING btree ("name","prompt_type","version");
