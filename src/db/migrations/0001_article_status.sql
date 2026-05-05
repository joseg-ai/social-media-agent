-- WI-07: Add article_status enum + status column to articles
-- Migration generated manually (drizzle-kit generate equivalent)
-- Adds the lifecycle status field consumed by the relevance scoring agent.

CREATE TYPE "public"."article_status" AS ENUM('new', 'scored', 'rejected', 'selected');--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "status" "article_status" DEFAULT 'new' NOT NULL;--> statement-breakpoint
CREATE INDEX "articles_status_idx" ON "articles" USING btree ("status");
