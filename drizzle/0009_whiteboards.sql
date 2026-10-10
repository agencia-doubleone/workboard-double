CREATE TABLE "whiteboard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"access" text DEFAULT 'private' NOT NULL,
	"job_id" uuid,
	"owner_id" text,
	"preview" text,
	"preview_updated_at" timestamp with time zone,
	"content_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_updated_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whiteboard_element" (
	"whiteboard_id" uuid NOT NULL,
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"version_nonce" integer NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whiteboard_element_whiteboard_id_id_pk" PRIMARY KEY("whiteboard_id","id")
);
--> statement-breakpoint
CREATE TABLE "whiteboard_member" (
	"whiteboard_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "whiteboard_member_whiteboard_id_user_id_pk" PRIMARY KEY("whiteboard_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "whiteboard_id" uuid;--> statement-breakpoint
ALTER TABLE "whiteboard" ADD CONSTRAINT "whiteboard_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard" ADD CONSTRAINT "whiteboard_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard" ADD CONSTRAINT "whiteboard_content_updated_by_id_user_id_fk" FOREIGN KEY ("content_updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_element" ADD CONSTRAINT "whiteboard_element_whiteboard_id_whiteboard_id_fk" FOREIGN KEY ("whiteboard_id") REFERENCES "public"."whiteboard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_member" ADD CONSTRAINT "whiteboard_member_whiteboard_id_whiteboard_id_fk" FOREIGN KEY ("whiteboard_id") REFERENCES "public"."whiteboard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_member" ADD CONSTRAINT "whiteboard_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whiteboard_owner_idx" ON "whiteboard" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "whiteboard_job_idx" ON "whiteboard" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "whiteboard_content_updated_at_idx" ON "whiteboard" USING btree ("content_updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "whiteboard_element_updated_at_idx" ON "whiteboard_element" USING btree ("whiteboard_id","updated_at");--> statement-breakpoint
CREATE INDEX "whiteboard_member_user_idx" ON "whiteboard_member" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_whiteboard_id_whiteboard_id_fk" FOREIGN KEY ("whiteboard_id") REFERENCES "public"."whiteboard"("id") ON DELETE cascade ON UPDATE no action;