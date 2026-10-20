ALTER TABLE "renter_links" ADD COLUMN "claim_code_hash" text;--> statement-breakpoint
ALTER TABLE "renter_links" ADD COLUMN "claim_code_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "renter_links" ADD COLUMN "claim_code_attempts" integer DEFAULT 0 NOT NULL;