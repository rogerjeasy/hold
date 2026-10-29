-- A shop's own insights dashboard, as an owner or manager left it in AG Studio (extensions.md section 12.5). One per
-- shop, written over on each save; the app reads and writes it, the worker never does.
CREATE TABLE "insights_dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"state" jsonb NOT NULL,
	"report_version" integer NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insights_dashboards_shopId_unique" UNIQUE("shop_id")
);
--> statement-breakpoint
ALTER TABLE "insights_dashboards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "insights_dashboards" ADD CONSTRAINT "insights_dashboards_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights_dashboards" ADD CONSTRAINT "insights_dashboards_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "insights_dashboards" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("insights_dashboards"."shop_id")) WITH CHECK (hold_in_scope("insights_dashboards"."shop_id"));--> statement-breakpoint
GRANT SELECT, INSERT ON insights_dashboards TO hold_app;--> statement-breakpoint
GRANT UPDATE (state, report_version, updated_by_user_id, updated_at) ON insights_dashboards TO hold_app;
