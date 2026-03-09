ALTER TABLE "history" ADD COLUMN "actor_id" text;--> statement-breakpoint
CREATE INDEX "history_actor_id_idx" ON "history" USING btree ("actor_id");