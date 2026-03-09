-- Add new task statuses
ALTER TYPE "task_status" ADD VALUE IF NOT EXISTS 'backlog' BEFORE 'not-started';--> statement-breakpoint
ALTER TYPE "task_status" ADD VALUE IF NOT EXISTS 'cancelled' AFTER 'completed';--> statement-breakpoint

-- Add priority, sort_order, parent_id columns to tasks
ALTER TABLE "tasks" ADD COLUMN "priority" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "sort_order" numeric;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "parent_id" text REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint

-- Rename enabled -> processing_enabled across all content tables
ALTER TABLE "tasks" RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE "bookmarks" RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE "documents" RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE "photos" RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE "notes" RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint

-- Drop old partial indexes (using old column name)
DROP INDEX IF EXISTS "tasks_user_id_enabled_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "bookmarks_user_id_enabled_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "documents_user_id_enabled_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "photos_user_id_enabled_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "notes_user_id_enabled_idx";--> statement-breakpoint

-- Create new partial indexes with renamed column
CREATE INDEX "tasks_user_id_processing_enabled_idx" ON "tasks" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_processing_enabled_idx" ON "bookmarks" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "documents_user_id_processing_enabled_idx" ON "documents" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "photos_user_id_processing_enabled_idx" ON "photos" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "notes_user_id_processing_enabled_idx" ON "notes" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint

-- New task indexes
CREATE INDEX "tasks_parent_id_idx" ON "tasks" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "tasks_user_id_priority_created_at_idx" ON "tasks" USING btree ("user_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "tasks_user_id_sort_order_idx" ON "tasks" USING btree ("user_id","sort_order");
