CREATE TABLE "agent_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"thinking_content" text,
	"text_content" text,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"stop_reason" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"tool_executions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "conversation_id" text;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "message_id" text;--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_steps_message_id_idx" ON "agent_steps" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "agent_steps_conversation_id_idx" ON "agent_steps" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agent_steps_conversation_id_step_number_idx" ON "agent_steps" USING btree ("conversation_id","step_number");--> statement-breakpoint
ALTER TABLE "history" ADD CONSTRAINT "history_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history" ADD CONSTRAINT "history_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "history_conversation_id_idx" ON "history" USING btree ("conversation_id");