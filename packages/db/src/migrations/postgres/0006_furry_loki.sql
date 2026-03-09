ALTER TYPE "public"."task_status" ADD VALUE 'backlog' BEFORE 'not-started';--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "bookmarks" RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE "documents" RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE "notes" RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE "photos" RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE "tasks" RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
DROP INDEX "bookmarks_user_id_enabled_idx";--> statement-breakpoint
DROP INDEX "documents_user_id_enabled_idx";--> statement-breakpoint
DROP INDEX "notes_user_id_enabled_idx";--> statement-breakpoint
DROP INDEX "photos_user_id_enabled_idx";--> statement-breakpoint
DROP INDEX "tasks_user_id_enabled_idx";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "sort_order" double precision;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_processing_enabled_idx" ON "bookmarks" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_created_at_idx" ON "bookmarks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_title_idx" ON "bookmarks" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "bookmarks_title_trgm_idx" ON "bookmarks" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "documents_user_id_processing_enabled_idx" ON "documents" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "documents_user_id_created_at_idx" ON "documents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_user_id_title_idx" ON "documents" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "documents_title_trgm_idx" ON "documents" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "documents_user_id_updated_at_idx" ON "documents" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "notes_user_id_processing_enabled_idx" ON "notes" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "notes_user_id_created_at_idx" ON "notes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notes_user_id_title_idx" ON "notes" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "notes_title_trgm_idx" ON "notes" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "photos_user_id_processing_enabled_idx" ON "photos" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "photos_user_id_created_at_idx" ON "photos" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "photos_user_id_date_taken_idx" ON "photos" USING btree ("user_id","date_taken");--> statement-breakpoint
CREATE INDEX "photos_user_id_title_idx" ON "photos" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "photos_title_trgm_idx" ON "photos" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tasks_parent_id_idx" ON "tasks" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "tasks_user_id_processing_enabled_idx" ON "tasks" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "tasks_user_id_created_at_idx" ON "tasks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_user_id_due_date_idx" ON "tasks" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE INDEX "tasks_user_id_status_created_at_idx" ON "tasks" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "tasks_user_id_priority_created_at_idx" ON "tasks" USING btree ("user_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "tasks_user_id_sort_order_idx" ON "tasks" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "tasks_title_trgm_idx" ON "tasks" USING gin ("title" gin_trgm_ops);