-- Phones registered for push notifications in Hold's app (architecture.md section 13.9): a member of staff's in one
-- shop, or a renter's for one rental through the link it registered with. Only the Expo push token is kept, never a
-- link token.
CREATE TABLE "push_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"user_id" uuid,
	"rental_id" uuid,
	"renter_link_id" uuid,
	"reference" text,
	"expo_push_token" text NOT NULL,
	"platform" text NOT NULL,
	"locale" text NOT NULL,
	"pending_ticket" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "push_devices_reference_unique" UNIQUE("reference"),
	CONSTRAINT "one_staff_registration" UNIQUE("expo_push_token","shop_id","user_id"),
	CONSTRAINT "one_renter_registration" UNIQUE("expo_push_token","rental_id"),
	CONSTRAINT "platform_allowed" CHECK ("push_devices"."platform" in ('ios', 'android')),
	CONSTRAINT "staff_or_renter" CHECK (("push_devices"."user_id" is null) <> ("push_devices"."rental_id" is null)),
	CONSTRAINT "renter_through_link" CHECK (("push_devices"."rental_id" is null) = ("push_devices"."renter_link_id" is null) and ("push_devices"."rental_id" is null) = ("push_devices"."reference" is null))
);
--> statement-breakpoint
ALTER TABLE "push_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_renter_link_id_renter_links_id_fk" FOREIGN KEY ("renter_link_id") REFERENCES "public"."renter_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "push_devices" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("push_devices"."shop_id")) WITH CHECK (hold_in_scope("push_devices"."shop_id"));--> statement-breakpoint
GRANT SELECT, INSERT ON push_devices TO hold_app;--> statement-breakpoint
GRANT UPDATE (platform, locale, renter_link_id, last_used_at, revoked_at, pending_ticket) ON push_devices TO hold_app;--> statement-breakpoint
GRANT SELECT ON push_devices TO hold_worker;--> statement-breakpoint
GRANT UPDATE (last_used_at, revoked_at, pending_ticket) ON push_devices TO hold_worker;
