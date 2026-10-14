CREATE TABLE "client_date" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"label" text NOT NULL,
	"date" date NOT NULL,
	"yearly" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "founded_on" date;--> statement-breakpoint
ALTER TABLE "client_date" ADD CONSTRAINT "client_date_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_date_client_idx" ON "client_date" USING btree ("client_id","position");