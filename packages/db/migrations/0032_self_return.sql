ALTER TABLE "rentals" DROP CONSTRAINT "state_allowed";--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD COLUMN "by_renter" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "dropped_off_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "drop_off_missing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "drop_off_missing_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "self_return" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "drop_point" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "opens_at" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "closes_at" text;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_drop_off_missing_by_user_id_users_id_fk" FOREIGN KEY ("drop_off_missing_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "state_allowed" CHECK ("rentals"."state" in ('pending_payment', 'booked', 'awaiting_hold', 'ready', 'out', 'overdue', 'dropped_off', 'returned', 'inspecting', 'settling', 'closed', 'cancelled', 'abandoned'));--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "self_return_has_drop_point" CHECK (not "shops"."self_return" or "shops"."drop_point" is not null);--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "hours_both_or_neither" CHECK (("shops"."opens_at" is null) = ("shops"."closes_at" is null));