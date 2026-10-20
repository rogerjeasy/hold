ALTER TABLE "comparisons" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comparisons" ADD COLUMN "deferred_reason" text;--> statement-breakpoint
ALTER TABLE "comparisons" ADD COLUMN "simulated" boolean DEFAULT false NOT NULL;