ALTER TABLE "jobs" ADD COLUMN "subtitle_mode" varchar(16) DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "subtitle_style" varchar(16) DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "translation_direction" varchar(8);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "banner_position" varchar(24) DEFAULT 'top_right' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "banner_scale" double precision DEFAULT 0.25 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "banner_object_key" text;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "subtitle_mode" varchar(16) DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "subtitle_style" varchar(16) DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "translation_direction" varchar(8);--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "banner_position" varchar(24) DEFAULT 'top_right' NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "banner_scale" double precision DEFAULT 0.25 NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "banner_object_key" text;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "banner_file_size" bigint;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "banner_content_type" text;