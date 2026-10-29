-- Extensions a renter pays for from their phone (architecture.md section 6.14). The app quotes, orders and starts the
-- capture; the worker marks one paid or failed. Neither may change what was priced: only state, the order and when
-- it was paid can be updated.
CREATE TABLE "rental_extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"from_ends_at" timestamp with time zone NOT NULL,
	"to_ends_at" timestamp with time zone NOT NULL,
	"extra_days" integer NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"state" text DEFAULT 'quoted' NOT NULL,
	"paypal_order_id" text,
	"asked_through" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "rental_extensions_paypalOrderId_unique" UNIQUE("paypal_order_id"),
	CONSTRAINT "state_allowed" CHECK ("rental_extensions"."state" in ('quoted', 'ordered', 'capturing', 'paid', 'failed', 'replaced')),
	CONSTRAINT "asked_through_allowed" CHECK ("rental_extensions"."asked_through" in ('link', 'assistant')),
	CONSTRAINT "later_end" CHECK ("rental_extensions"."to_ends_at" > "rental_extensions"."from_ends_at")
);
--> statement-breakpoint
ALTER TABLE "rental_extensions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "executions" DROP CONSTRAINT "action_allowed";--> statement-breakpoint
ALTER TABLE "money_events" DROP CONSTRAINT "kind_allowed";--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "extension_max_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "rental_extensions" ADD CONSTRAINT "rental_extensions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_extensions" ADD CONSTRAINT "rental_extensions_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "action_allowed" CHECK ("executions"."action" in ('authorize', 'renew', 'release', 'capture', 'refund', 'invoice', 'fee_capture', 'extension_capture'));--> statement-breakpoint
ALTER TABLE "money_events" ADD CONSTRAINT "kind_allowed" CHECK ("money_events"."kind" in ('fee_captured', 'hold_placed', 'hold_renewed', 'hold_released', 'hold_captured', 'refunded', 'invoice_sent', 'invoice_paid', 'extension_captured'));--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "extension_days_allowed" CHECK ("shops"."extension_max_days" between 0 and 28);--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "rental_extensions" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("rental_extensions"."shop_id")) WITH CHECK (hold_in_scope("rental_extensions"."shop_id"));--> statement-breakpoint
GRANT SELECT, INSERT ON rental_extensions TO hold_app;--> statement-breakpoint
GRANT SELECT ON rental_extensions TO hold_worker;--> statement-breakpoint
-- The test and demo environments run the worker in the app's process, as hold_app, as for incidents and proposals.
GRANT UPDATE (state, paypal_order_id, paid_at) ON rental_extensions TO hold_app, hold_worker;
