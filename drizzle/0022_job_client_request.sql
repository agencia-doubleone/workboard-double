ALTER TABLE "job" ADD COLUMN "client_request_id" uuid;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_client_request_id_client_request_id_fk" FOREIGN KEY ("client_request_id") REFERENCES "public"."client_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_client_request_idx" ON "job" USING btree ("client_request_id");