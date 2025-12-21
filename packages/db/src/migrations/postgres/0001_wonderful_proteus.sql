CREATE TABLE "queue_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"key" text,
	"data" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_retry_at" timestamp,
	"backoff_ms" integer,
	"backoff_type" text,
	"locked_by" text,
	"locked_at" timestamp,
	"expires_at" timestamp,
	"lock_token" text,
	"error_message" text,
	"error_details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"stages" jsonb,
	"current_stage" text,
	"overall_progress" integer DEFAULT 0,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "queue_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"key" text NOT NULL,
	"cron" text NOT NULL,
	"data" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"run_limit" integer,
	"run_count" integer DEFAULT 0 NOT NULL,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "queue_schedules_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "asset_processing_jobs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "asset_processing_jobs" CASCADE;--> statement-breakpoint
DROP INDEX "tasks_is_recurring_idx";--> statement-breakpoint
DROP INDEX "tasks_next_run_at_idx";--> statement-breakpoint
DROP INDEX "tasks_last_run_at_idx";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "last_executed_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "queue_jobs_queue_key_idx" ON "queue_jobs" USING btree ("queue","key");--> statement-breakpoint
CREATE INDEX "queue_jobs_queue_status_idx" ON "queue_jobs" USING btree ("queue","status");--> statement-breakpoint
CREATE INDEX "queue_jobs_status_scheduled_idx" ON "queue_jobs" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "queue_jobs_status_retry_idx" ON "queue_jobs" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "queue_jobs_status_expires_idx" ON "queue_jobs" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "queue_schedules_enabled_next_run_idx" ON "queue_schedules" USING btree ("enabled","next_run_at");--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "is_recurring";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "cron_expression";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "recurrence_end_date";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "recurrence_limit";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "run_immediately";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "next_run_at";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "last_run_at";