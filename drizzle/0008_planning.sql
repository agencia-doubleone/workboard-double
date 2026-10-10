CREATE TABLE "planning" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"networks" text[] DEFAULT '{}' NOT NULL,
	"posts_per_month" integer,
	"overview" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "planning_member" (
	"planning_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "planning_member_planning_id_user_id_pk" PRIMARY KEY("planning_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "planning_month" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planning_id" uuid NOT NULL,
	"month" text NOT NULL,
	"status" text DEFAULT 'producao' NOT NULL,
	"concept" text,
	"document" text,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_month_planning_month_unique" UNIQUE("planning_id","month")
);
--> statement-breakpoint
CREATE TABLE "planning_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month_id" uuid NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"date" date,
	"network" text,
	"format" text,
	"topic" text,
	"headline" text DEFAULT '' NOT NULL,
	"copy" text DEFAULT '' NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'producao' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "planning_id" uuid;--> statement-breakpoint
ALTER TABLE "planning" ADD CONSTRAINT "planning_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning" ADD CONSTRAINT "planning_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_member" ADD CONSTRAINT "planning_member_planning_id_planning_id_fk" FOREIGN KEY ("planning_id") REFERENCES "public"."planning"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_member" ADD CONSTRAINT "planning_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_month" ADD CONSTRAINT "planning_month_planning_id_planning_id_fk" FOREIGN KEY ("planning_id") REFERENCES "public"."planning"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_post" ADD CONSTRAINT "planning_post_month_id_planning_month_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."planning_month"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planning_member_user_idx" ON "planning_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "planning_month_month_idx" ON "planning_month" USING btree ("month");--> statement-breakpoint
CREATE INDEX "planning_post_month_idx" ON "planning_post" USING btree ("month_id","date","position");--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_planning_id_planning_id_fk" FOREIGN KEY ("planning_id") REFERENCES "public"."planning"("id") ON DELETE cascade ON UPDATE no action;