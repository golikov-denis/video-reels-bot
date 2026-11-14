ALTER TYPE "public"."job_status" ADD VALUE 'processing';--> statement-breakpoint
ALTER TYPE "public"."job_status" ADD VALUE 'completed';--> statement-breakpoint
ALTER TYPE "public"."job_status" ADD VALUE 'failed';--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "lease_owner" varchar(128);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "result_object_key" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "result_size" bigint;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "result_content_type" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "error_code" varchar(64);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "notification_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "jobs_status_lease_expires_at_idx" ON "jobs" USING btree ("status","lease_expires_at");