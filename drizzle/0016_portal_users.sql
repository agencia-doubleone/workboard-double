CREATE TABLE "portal_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "portal_rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "portal_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "portal_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "portal_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"client_id" uuid NOT NULL,
	"can_approve" boolean DEFAULT true NOT NULL,
	"disabled_at" timestamp with time zone,
	"last_sign_in_at" timestamp with time zone,
	"invited_at" timestamp with time zone,
	"created_by_id" text,
	CONSTRAINT "portal_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "portal_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_account" ADD CONSTRAINT "portal_account_user_id_portal_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."portal_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_session" ADD CONSTRAINT "portal_session_user_id_portal_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."portal_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_user" ADD CONSTRAINT "portal_user_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_user" ADD CONSTRAINT "portal_user_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_account_user_id_idx" ON "portal_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "portal_session_user_id_idx" ON "portal_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "portal_user_client_idx" ON "portal_user" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "portal_verification_identifier_idx" ON "portal_verification" USING btree ("identifier");