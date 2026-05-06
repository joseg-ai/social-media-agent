-- WI-12: LinkedIn poster — cache person URN on oauth_tokens row
-- Avoids repeated GET /v2/userinfo calls on every publish run.
-- Populated on first successful postToLinkedIn(); null until then.

ALTER TABLE "oauth_tokens" ADD COLUMN "linkedin_person_urn" text;
