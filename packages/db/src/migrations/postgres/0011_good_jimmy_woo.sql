CREATE TABLE "task_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"schedule_key" text,
	"job_id" text,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"error" text,
	"result_summary" text,
	"token_usage" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "queue_schedules" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "task_executions" ADD CONSTRAINT "task_executions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_executions" ADD CONSTRAINT "task_executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_executions_task_id_created_at_idx" ON "task_executions" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_executions_user_id_created_at_idx" ON "task_executions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "task_executions_status_idx" ON "task_executions" USING btree ("status");