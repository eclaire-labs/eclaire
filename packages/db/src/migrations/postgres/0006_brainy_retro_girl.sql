CREATE TYPE "public"."scheduled_action_execution_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."scheduled_action_kind" AS ENUM('reminder', 'agent_run');--> statement-breakpoint
CREATE TYPE "public"."scheduled_action_status" AS ENUM('active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."scheduled_action_trigger_type" AS ENUM('once', 'recurring');--> statement-breakpoint
CREATE TABLE "scheduled_action_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"scheduled_action_id" text NOT NULL,
	"user_id" text NOT NULL,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"status" "scheduled_action_execution_status" DEFAULT 'pending' NOT NULL,
	"output" text,
	"error" text,
	"delivery_result" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "scheduled_action_kind" NOT NULL,
	"status" "scheduled_action_status" DEFAULT 'active' NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"trigger_type" "scheduled_action_trigger_type" NOT NULL,
	"run_at" timestamp with time zone,
	"cron_expression" text,
	"timezone" text,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"max_runs" integer,
	"run_count" integer DEFAULT 0 NOT NULL,
	"delivery_targets" jsonb DEFAULT '[{"type":"notification_channels"}]'::jsonb NOT NULL,
	"source_conversation_id" text,
	"agent_actor_id" text,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_action_executions" ADD CONSTRAINT "scheduled_action_executions_scheduled_action_id_scheduled_actions_id_fk" FOREIGN KEY ("scheduled_action_id") REFERENCES "public"."scheduled_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_action_executions" ADD CONSTRAINT "scheduled_action_executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD CONSTRAINT "scheduled_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD CONSTRAINT "scheduled_actions_agent_actor_id_actors_id_fk" FOREIGN KEY ("agent_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sa_executions_action_id_created_at_idx" ON "scheduled_action_executions" USING btree ("scheduled_action_id","created_at");--> statement-breakpoint
CREATE INDEX "sa_executions_user_id_created_at_idx" ON "scheduled_action_executions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "sa_executions_status_idx" ON "scheduled_action_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scheduled_actions_user_id_status_idx" ON "scheduled_actions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "scheduled_actions_user_id_next_run_at_idx" ON "scheduled_actions" USING btree ("user_id","next_run_at");--> statement-breakpoint
CREATE INDEX "scheduled_actions_status_next_run_at_idx" ON "scheduled_actions" USING btree ("status","next_run_at");