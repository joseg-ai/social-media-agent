CREATE TYPE "public"."post_state" AS ENUM('draft', 'scheduled', 'posting', 'posted', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."prompt_type" AS ENUM('scoring', 'drafting', 'timing');--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed_source_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"url" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"published_at" timestamp with time zone,
	"author" text,
	"raw_metadata" jsonb,
	"relevance_score" real,
	"scoring_reasoning" text,
	"scored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_url_unique" UNIQUE("url"),
	CONSTRAINT "articles_url_content_hash_uq" UNIQUE("url","content_hash")
);
--> statement-breakpoint
CREATE TABLE "feed_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"poll_interval_minutes" integer DEFAULT 120 NOT NULL,
	"last_polled_at" timestamp with time zone,
	"consecutive_fail_count" integer DEFAULT 0 NOT NULL,
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_sources_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" varchar(100) NOT NULL,
	"prompt_type" "prompt_type",
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" real,
	"duration_ms" integer,
	"article_id" uuid,
	"post_id" uuid,
	"prompt_id" uuid,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(50) DEFAULT 'linkedin' NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text,
	"iv" varchar(64) NOT NULL,
	"auth_tag" varchar(64) NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"scope" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_tokens_provider_uq" UNIQUE("provider")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"state" "post_state" DEFAULT 'draft' NOT NULL,
	"draft_text" text,
	"edited_text" text,
	"timing_rationale" text,
	"scheduled_for" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"linkedin_post_id" text,
	"failure_reason" text,
	"is_dry_run" boolean DEFAULT false NOT NULL,
	"auto_post" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"prompt_type" "prompt_type" NOT NULL,
	"content" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_feed_source_id_feed_sources_id_fk" FOREIGN KEY ("feed_source_id") REFERENCES "public"."feed_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_feed_source_id_idx" ON "articles" USING btree ("feed_source_id");--> statement-breakpoint
CREATE INDEX "articles_published_at_idx" ON "articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "articles_relevance_score_idx" ON "articles" USING btree ("relevance_score");--> statement-breakpoint
CREATE INDEX "articles_created_at_idx" ON "articles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feed_sources_enabled_idx" ON "feed_sources" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "llm_calls_created_at_idx" ON "llm_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "llm_calls_model_idx" ON "llm_calls" USING btree ("model");--> statement-breakpoint
CREATE INDEX "llm_calls_article_id_idx" ON "llm_calls" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "llm_calls_post_id_idx" ON "llm_calls" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "posts_state_scheduled_for_idx" ON "posts" USING btree ("state","scheduled_for");--> statement-breakpoint
CREATE INDEX "posts_article_id_idx" ON "posts" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "prompts_name_type_idx" ON "prompts" USING btree ("name","prompt_type");--> statement-breakpoint
CREATE INDEX "prompts_type_active_idx" ON "prompts" USING btree ("prompt_type","is_active");