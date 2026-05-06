-- WI-11: Post state machine — add failure_count and cancel_reason to posts
-- failure_reason already existed (used as last_error); only two columns are new.

ALTER TABLE "posts" ADD COLUMN "failure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "cancel_reason" text;
