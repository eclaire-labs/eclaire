ALTER TABLE "bookmarks" ADD COLUMN "processing_status" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "processing_status" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "processing_status" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "processing_status" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "processing_status" text;