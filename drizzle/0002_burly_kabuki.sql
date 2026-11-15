ALTER TABLE "jobs" ADD COLUMN "source_duration_seconds" double precision;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "selection_start_seconds" double precision;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "selection_end_seconds" double precision;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "selection_confidence" double precision;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "selection_strategy" varchar(32);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "detected_language" varchar(16);