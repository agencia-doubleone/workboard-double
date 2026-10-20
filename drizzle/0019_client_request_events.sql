CREATE TABLE "client_request_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"actor_side" text NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_request_event_type_check" CHECK ("client_request_event"."type" in ('expected_on', 'edited')),
	CONSTRAINT "client_request_event_side_check" CHECK ("client_request_event"."actor_side" in ('team', 'client'))
);
--> statement-breakpoint
ALTER TABLE "client_request" ADD COLUMN "created_by_side" text DEFAULT 'client' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_request" ADD COLUMN "created_by_id" text;--> statement-breakpoint
ALTER TABLE "client_request_event" ADD CONSTRAINT "client_request_event_request_id_client_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."client_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_event" ADD CONSTRAINT "client_request_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_request_event_request_idx" ON "client_request_event" USING btree ("request_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "client_request" ADD CONSTRAINT "client_request_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request" ADD CONSTRAINT "client_request_created_by_side_check" CHECK ("client_request"."created_by_side" in ('team', 'client'));