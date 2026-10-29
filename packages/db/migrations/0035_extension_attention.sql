-- Money PayPal moved for an extension that Hold did not apply as quoted (architecture.md section 6.14): the worker
-- records it for a person, and an owner or manager marks it checked. Nothing else about the extension may change.
ALTER TABLE "rental_extensions" ADD COLUMN "attention" text;--> statement-breakpoint
ALTER TABLE "rental_extensions" ADD COLUMN "attention_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rental_extensions" ADD COLUMN "captured_cents" bigint;--> statement-breakpoint
ALTER TABLE "rental_extensions" ADD COLUMN "paypal_capture_id" text;--> statement-breakpoint
ALTER TABLE "rental_extensions" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rental_extensions" ADD COLUMN "checked_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "rental_extensions" ADD CONSTRAINT "rental_extensions_checked_by_user_id_users_id_fk" FOREIGN KEY ("checked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_extensions" ADD CONSTRAINT "attention_allowed" CHECK ("rental_extensions"."attention" is null or "rental_extensions"."attention" in ('amount_mismatch', 'paid_after_expiry'));--> statement-breakpoint
GRANT UPDATE (attention, attention_at, captured_cents, paypal_capture_id) ON rental_extensions TO hold_app, hold_worker;--> statement-breakpoint
GRANT UPDATE (checked_at, checked_by_user_id) ON rental_extensions TO hold_app;
