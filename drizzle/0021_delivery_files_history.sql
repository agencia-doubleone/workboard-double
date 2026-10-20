ALTER TABLE "client_request_delivery_file" DROP CONSTRAINT "client_request_delivery_file_media_id_media_id_fk";
--> statement-breakpoint
ALTER TABLE "client_request_delivery_file" ALTER COLUMN "media_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "client_request_delivery" ADD COLUMN "files_removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_request_delivery" ADD COLUMN "files_removed_by_name" text;--> statement-breakpoint
ALTER TABLE "client_request_delivery_file" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "client_request_delivery_file" ADD CONSTRAINT "client_request_delivery_file_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- As rodadas que já existem guardam o nome do arquivo (continua aparecendo depois que ele sair do servidor).
UPDATE "client_request_delivery_file" SET "name" = "media"."name" FROM "media" WHERE "media"."id" = "client_request_delivery_file"."media_id";
