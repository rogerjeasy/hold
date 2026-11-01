-- Text messages to renters (architecture.md section 12.3): how each rental's renter is reached, the phone they confirmed,
-- and each text sent with what became of it. A real text's words are never stored.
CREATE TABLE "text_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"to_phone" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"body" text,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_at" timestamp with time zone,
	CONSTRAINT "text_messages_providerMessageId_unique" UNIQUE("provider_message_id"),
	CONSTRAINT "purpose_allowed" CHECK ("text_messages"."purpose" in ('renter_link', 'condition_link', 'drop_off', 'shop_message', 'renter_code', 'phone_code', 'reminder', 'hold_renewal', 'promise_missed', 'receipt')),
	CONSTRAINT "status_allowed" CHECK ("text_messages"."status" in ('sent', 'delivered', 'failed', 'opted_out', 'simulated')),
	CONSTRAINT "words_only_when_shown" CHECK (("text_messages"."status" = 'simulated') = ("text_messages"."body" is not null))
);
--> statement-breakpoint
ALTER TABLE "text_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "contact_channel" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "phone_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "phone_code_hash" text;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "phone_code_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "phone_code_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "text_messages" ADD CONSTRAINT "text_messages_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_messages" ADD CONSTRAINT "text_messages_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "contactChannel_allowed" CHECK ("rentals"."contact_channel" in ('email', 'text'));--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "texts_need_a_phone" CHECK ("rentals"."contact_channel" = 'email' or "rentals"."contact_phone" is not null);--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "confirmed_phone_exists" CHECK ("rentals"."phone_confirmed_at" is null or "rentals"."contact_phone" is not null);--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "text_messages" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("text_messages"."shop_id")) WITH CHECK (hold_in_scope("text_messages"."shop_id"));--> statement-breakpoint
GRANT SELECT, INSERT ON text_messages TO hold_app, hold_worker;--> statement-breakpoint
GRANT UPDATE (status, status_at, failure) ON text_messages TO hold_worker;
--> statement-breakpoint
-- The worker counts each text it sends against the day's limits, as the web app does.
GRANT EXECUTE ON FUNCTION hold_take_rate_token(text, integer, integer) TO hold_worker;
