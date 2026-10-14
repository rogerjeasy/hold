CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_starts_at" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "staff_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"approval_limit_cents" bigint DEFAULT 0 NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"token_fingerprint" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_invitations_tokenFingerprint_unique" UNIQUE("token_fingerprint"),
	CONSTRAINT "role_allowed" CHECK ("staff_invitations"."role" in ('owner', 'manager', 'counter_staff', 'read_only'))
);
--> statement-breakpoint
ALTER TABLE "staff_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "price_entries" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_entries" ADD CONSTRAINT "category_allowed" CHECK ("price_entries"."category" in ('damage', 'loss', 'lateness', 'cleaning'));--> statement-breakpoint
CREATE POLICY "through_function_only" ON "rate_limits" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "staff_invitations" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("staff_invitations"."shop_id")) WITH CHECK (hold_in_scope("staff_invitations"."shop_id"));