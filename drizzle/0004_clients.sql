CREATE TABLE "client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_key" text,
	"website" text,
	"instagram" text,
	"facebook" text,
	"linkedin" text,
	"youtube" text,
	"age_min" integer DEFAULT 0 NOT NULL,
	"age_max" integer DEFAULT 100 NOT NULL,
	"genders" text[] DEFAULT '{}' NOT NULL,
	"social_classes" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "client_credential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"service" text NOT NULL,
	"url" text,
	"username" text,
	"password_encrypted" text NOT NULL,
	"notes_encrypted" text,
	"created_by_id" text,
	"updated_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_credential" ADD CONSTRAINT "client_credential_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_credential" ADD CONSTRAINT "client_credential_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_credential" ADD CONSTRAINT "client_credential_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_name_idx" ON "client" USING btree ("name");--> statement-breakpoint
CREATE INDEX "client_credential_client_idx" ON "client_credential" USING btree ("client_id","service");