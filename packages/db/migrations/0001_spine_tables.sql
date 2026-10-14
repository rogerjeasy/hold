CREATE TYPE "public"."approval_decision" AS ENUM('approved', 'rejected', 'waived');--> statement-breakpoint
CREATE TYPE "public"."approval_method" AS ENUM('on_screen', 'mandate');--> statement-breakpoint
CREATE TYPE "public"."approval_subject" AS ENUM('claim', 'release', 'refund');--> statement-breakpoint
CREATE TYPE "public"."authorization_state" AS ENUM('created', 'renewed', 'voided', 'captured', 'expired');--> statement-breakpoint
CREATE TYPE "public"."capture_session_kind" AS ENUM('handover', 'return', 'packing', 'unboxing', 'send_back');--> statement-breakpoint
CREATE TYPE "public"."claim_line_source" AS ENUM('finding', 'person');--> statement-breakpoint
CREATE TYPE "public"."claim_reply_decision" AS ENUM('accept', 'contest');--> statement-breakpoint
CREATE TYPE "public"."claim_state" AS ENUM('draft', 'awaiting_approval', 'approved', 'presented', 'accepted', 'contested', 'lapsed', 'negotiating', 'agreed', 'escalated', 'decided', 'charging', 'charged', 'charge_failed', 'adjusted', 'waived', 'closed');--> statement-breakpoint
CREATE TYPE "public"."comparison_state" AS ENUM('pending', 'running', 'clean', 'findings', 'deferred', 'failed');--> statement-breakpoint
CREATE TYPE "public"."execution_action" AS ENUM('renew', 'release', 'capture', 'refund', 'invoice');--> statement-breakpoint
CREATE TYPE "public"."execution_state" AS ENUM('pending', 'submitted', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."finding_class" AS ENUM('new_damage', 'known_mark', 'wear', 'missing_part', 'uncertain');--> statement-breakpoint
CREATE TYPE "public"."hold_state" AS ENUM('requested', 'placed', 'declined', 'renewing', 'at_risk', 'releasing', 'released', 'capturing', 'captured', 'capture_failed', 'invoiced', 'expired');--> statement-breakpoint
CREATE TYPE "public"."invoice_state" AS ENUM('draft', 'sent', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."mark_status" AS ENUM('open', 'repaired');--> statement-breakpoint
CREATE TYPE "public"."money_event_kind" AS ENUM('fee_captured', 'hold_placed', 'hold_renewed', 'hold_released', 'hold_captured', 'refunded', 'invoice_sent', 'invoice_paid');--> statement-breakpoint
CREATE TYPE "public"."outbox_state" AS ENUM('pending', 'sent');--> statement-breakpoint
CREATE TYPE "public"."paypal_mode" AS ENUM('sandbox', 'live');--> statement-breakpoint
CREATE TYPE "public"."placement_strategy" AS ENUM('at_counter', 'combined', 'saved_method');--> statement-breakpoint
CREATE TYPE "public"."processing_state" AS ENUM('pending', 'applied', 'ignored', 'failed');--> statement-breakpoint
CREATE TYPE "public"."rental_state" AS ENUM('pending_payment', 'booked', 'awaiting_hold', 'ready', 'out', 'overdue', 'returned', 'inspecting', 'settling', 'closed', 'cancelled', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('owner', 'manager', 'counter_staff', 'read_only');--> statement-breakpoint
CREATE TYPE "public"."verification_state" AS ENUM('pending', 'verified', 'rejected', 'simulated');--> statement-breakpoint
CREATE TABLE "item_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency" char(3) NOT NULL,
	"value_cents" bigint NOT NULL,
	"hold_cents" bigint NOT NULL,
	"photo_plan_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"item_type_id" uuid NOT NULL,
	"label" text NOT NULL,
	"serial" text,
	"chain_head_fingerprint" text,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "photo_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"views" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photo_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "price_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"currency" char(3) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"category" text NOT NULL,
	CONSTRAINT "price_entries_priceListId_code_unique" UNIQUE("price_list_id","code")
);
--> statement-breakpoint
ALTER TABLE "price_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"published_text" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_lists_shopId_version_unique" UNIQUE("shop_id","version")
);
--> statement-breakpoint
ALTER TABLE "price_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wear_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"rules" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wear_policies_shopId_version_unique" UNIQUE("shop_id","version")
);
--> statement-breakpoint
ALTER TABLE "wear_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"subject" "approval_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"decided_by_user_id" uuid,
	"decision" "approval_decision" NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"method" "approval_method" NOT NULL,
	"mandate_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "claim_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"price_entry_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"source" "claim_line_source" NOT NULL,
	"finding_id" uuid,
	"added_by_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "claim_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"decision" "claim_reply_decision" NOT NULL,
	"comment" text,
	"added_photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_replies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"state" "claim_state" DEFAULT 'draft' NOT NULL,
	"raised_by_user_id" uuid,
	"presented_at" timestamp with time zone,
	"reply_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claims_rentalId_unique" UNIQUE("rental_id")
);
--> statement-breakpoint
ALTER TABLE "claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "capture_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rental_item_id" uuid NOT NULL,
	"kind" "capture_session_kind" NOT NULL,
	"actor_user_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sealed_at" timestamp with time zone,
	"manifest_fingerprint" text,
	"previous_manifest_fingerprint" text
);
--> statement-breakpoint
ALTER TABLE "capture_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"handover_session_id" uuid NOT NULL,
	"return_session_id" uuid NOT NULL,
	"state" "comparison_state" DEFAULT 'pending' NOT NULL,
	"alignment" jsonb,
	"model" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "comparisons_returnSessionId_unique" UNIQUE("return_session_id")
);
--> statement-breakpoint
ALTER TABLE "comparisons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evidence_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"evidence_key" text NOT NULL,
	"manifest_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_packs_evidenceKey_unique" UNIQUE("evidence_key"),
	CONSTRAINT "evidence_packs_rentalId_version_unique" UNIQUE("rental_id","version")
);
--> statement-breakpoint
ALTER TABLE "evidence_packs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"comparison_id" uuid NOT NULL,
	"view" text NOT NULL,
	"region" jsonb NOT NULL,
	"class" "finding_class" NOT NULL,
	"confidence" real NOT NULL,
	"description" text NOT NULL,
	"second_look_confirmed" boolean,
	"matched_mark_id" uuid,
	"suggested_price_entry_id" uuid
);
--> statement-breakpoint
ALTER TABLE "findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"view" text NOT NULL,
	"region" jsonb NOT NULL,
	"description" text NOT NULL,
	"first_seen_session_id" uuid NOT NULL,
	"status" "mark_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "marks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"view" text NOT NULL,
	"evidence_key" text NOT NULL,
	"display_key" text,
	"sha256" text NOT NULL,
	"perceptual_hash" text,
	"received_at" timestamp with time zone NOT NULL,
	"quality" jsonb,
	CONSTRAINT "photos_evidenceKey_unique" UNIQUE("evidence_key"),
	CONSTRAINT "photos_sessionId_view_unique" UNIQUE("session_id","view")
);
--> statement-breakpoint
ALTER TABLE "photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"subject_kind" text,
	"subject_id" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"queue" text NOT NULL,
	"message_group" text NOT NULL,
	"payload" jsonb NOT NULL,
	"state" "outbox_state" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "renter_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"token_fingerprint" text NOT NULL,
	"scopes" text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "renter_links_tokenFingerprint_unique" UNIQUE("token_fingerprint")
);
--> statement-breakpoint
ALTER TABLE "renter_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"hold_id" uuid NOT NULL,
	"action" "execution_action" NOT NULL,
	"idempotency_key" text NOT NULL,
	"currency" char(3),
	"amount_cents" bigint,
	"paypal_resource_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" "execution_state" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "executions_idempotencyKey_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "executions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"paypal_invoice_id" text,
	"currency" char(3) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"state" "invoice_state" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_paypalInvoiceId_unique" UNIQUE("paypal_invoice_id")
);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "money_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"hold_id" uuid,
	"kind" "money_event_kind" NOT NULL,
	"currency" char(3) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"paypal_fee_cents" bigint,
	"net_cents" bigint,
	"paypal_reference" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_events_paypalReference_unique" UNIQUE("paypal_reference")
);
--> statement-breakpoint
ALTER TABLE "money_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "paypal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"paypal_account_id" uuid NOT NULL,
	"paypal_event_id" text NOT NULL,
	"type" text NOT NULL,
	"raw_body" text NOT NULL,
	"headers" jsonb NOT NULL,
	"verification" "verification_state" DEFAULT 'pending' NOT NULL,
	"processing" "processing_state" DEFAULT 'pending' NOT NULL,
	"rental_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paypal_events_paypalEventId_unique" UNIQUE("paypal_event_id")
);
--> statement-breakpoint
ALTER TABLE "paypal_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"hold_id" uuid NOT NULL,
	"paypal_authorization_id" text NOT NULL,
	"currency" char(3) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"assured_until" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"state" "authorization_state" DEFAULT 'created' NOT NULL,
	"renewed_from_id" uuid,
	CONSTRAINT "authorizations_paypalAuthorizationId_unique" UNIQUE("paypal_authorization_id")
);
--> statement-breakpoint
ALTER TABLE "authorizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"reserved_cents" bigint NOT NULL,
	"strategy" "placement_strategy" NOT NULL,
	"state" "hold_state" DEFAULT 'requested' NOT NULL,
	"paypal_order_id" text,
	"current_authorization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holds_rentalId_unique" UNIQUE("rental_id"),
	CONSTRAINT "holds_paypalOrderId_unique" UNIQUE("paypal_order_id")
);
--> statement-breakpoint
ALTER TABLE "holds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rental_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"accessories_out" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accessories_back" jsonb,
	CONSTRAINT "rental_items_rentalId_itemId_unique" UNIQUE("rental_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "rental_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rentals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"renter_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"currency" char(3) NOT NULL,
	"fee_cents" bigint NOT NULL,
	"price_list_id" uuid NOT NULL,
	"wear_policy_id" uuid NOT NULL,
	"state" "rental_state" DEFAULT 'pending_payment' NOT NULL,
	"paypal_fee_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rentals_paypalFeeOrderId_unique" UNIQUE("paypal_fee_order_id")
);
--> statement-breakpoint
ALTER TABLE "rentals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "renters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paypal_payer_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"language" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "renters_paypalPayerId_unique" UNIQUE("paypal_payer_id")
);
--> statement-breakpoint
ALTER TABLE "renters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "paypal_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"merchant_id" text,
	"credential_reference" text NOT NULL,
	"webhook_id" text,
	"mode" "paypal_mode" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paypal_accounts_shopId_mode_unique" UNIQUE("shop_id","mode")
);
--> statement-breakpoint
ALTER TABLE "paypal_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"time_zone" text NOT NULL,
	"currency" char(3) NOT NULL,
	"owner_approval_threshold_cents" bigint NOT NULL,
	"reply_period_hours" integer DEFAULT 72 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shops" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "staff_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "staff_role" NOT NULL,
	"approval_limit_cents" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_roles_shopId_userId_unique" UNIQUE("shop_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "staff_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cognito_subject" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"language" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_cognitoSubject_unique" UNIQUE("cognito_subject")
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "item_types" ADD CONSTRAINT "item_types_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_types" ADD CONSTRAINT "item_types_photo_plan_id_photo_plans_id_fk" FOREIGN KEY ("photo_plan_id") REFERENCES "public"."photo_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_item_type_id_item_types_id_fk" FOREIGN KEY ("item_type_id") REFERENCES "public"."item_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_plans" ADD CONSTRAINT "photo_plans_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_entries" ADD CONSTRAINT "price_entries_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_entries" ADD CONSTRAINT "price_entries_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wear_policies" ADD CONSTRAINT "wear_policies_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_lines" ADD CONSTRAINT "claim_lines_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_lines" ADD CONSTRAINT "claim_lines_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_lines" ADD CONSTRAINT "claim_lines_price_entry_id_price_entries_id_fk" FOREIGN KEY ("price_entry_id") REFERENCES "public"."price_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_lines" ADD CONSTRAINT "claim_lines_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_lines" ADD CONSTRAINT "claim_lines_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_replies" ADD CONSTRAINT "claim_replies_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_replies" ADD CONSTRAINT "claim_replies_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_raised_by_user_id_users_id_fk" FOREIGN KEY ("raised_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_rental_item_id_rental_items_id_fk" FOREIGN KEY ("rental_item_id") REFERENCES "public"."rental_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_handover_session_id_capture_sessions_id_fk" FOREIGN KEY ("handover_session_id") REFERENCES "public"."capture_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_return_session_id_capture_sessions_id_fk" FOREIGN KEY ("return_session_id") REFERENCES "public"."capture_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD CONSTRAINT "evidence_packs_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD CONSTRAINT "evidence_packs_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_comparison_id_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."comparisons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_matched_mark_id_marks_id_fk" FOREIGN KEY ("matched_mark_id") REFERENCES "public"."marks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_suggested_price_entry_id_price_entries_id_fk" FOREIGN KEY ("suggested_price_entry_id") REFERENCES "public"."price_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_first_seen_session_id_capture_sessions_id_fk" FOREIGN KEY ("first_seen_session_id") REFERENCES "public"."capture_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_session_id_capture_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."capture_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renter_links" ADD CONSTRAINT "renter_links_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renter_links" ADD CONSTRAINT "renter_links_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_events" ADD CONSTRAINT "money_events_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_events" ADD CONSTRAINT "money_events_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_events" ADD CONSTRAINT "money_events_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paypal_events" ADD CONSTRAINT "paypal_events_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paypal_events" ADD CONSTRAINT "paypal_events_paypal_account_id_paypal_accounts_id_fk" FOREIGN KEY ("paypal_account_id") REFERENCES "public"."paypal_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paypal_events" ADD CONSTRAINT "paypal_events_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_renewed_from_id_authorizations_id_fk" FOREIGN KEY ("renewed_from_id") REFERENCES "public"."authorizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_current_authorization_id_authorizations_id_fk" FOREIGN KEY ("current_authorization_id") REFERENCES "public"."authorizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_renter_id_renters_id_fk" FOREIGN KEY ("renter_id") REFERENCES "public"."renters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_wear_policy_id_wear_policies_id_fk" FOREIGN KEY ("wear_policy_id") REFERENCES "public"."wear_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paypal_accounts" ADD CONSTRAINT "paypal_accounts_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "item_types" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("item_types"."shop_id")) WITH CHECK (hold_in_scope("item_types"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "items" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("items"."shop_id")) WITH CHECK (hold_in_scope("items"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "photo_plans" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("photo_plans"."shop_id")) WITH CHECK (hold_in_scope("photo_plans"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "price_entries" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("price_entries"."shop_id")) WITH CHECK (hold_in_scope("price_entries"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "price_lists" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("price_lists"."shop_id")) WITH CHECK (hold_in_scope("price_lists"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "wear_policies" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("wear_policies"."shop_id")) WITH CHECK (hold_in_scope("wear_policies"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "approvals" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("approvals"."shop_id")) WITH CHECK (hold_in_scope("approvals"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "claim_lines" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("claim_lines"."shop_id")) WITH CHECK (hold_in_scope("claim_lines"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "claim_replies" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("claim_replies"."shop_id")) WITH CHECK (hold_in_scope("claim_replies"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "claims" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("claims"."shop_id")) WITH CHECK (hold_in_scope("claims"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "capture_sessions" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("capture_sessions"."shop_id")) WITH CHECK (hold_in_scope("capture_sessions"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "comparisons" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("comparisons"."shop_id")) WITH CHECK (hold_in_scope("comparisons"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "evidence_packs" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("evidence_packs"."shop_id")) WITH CHECK (hold_in_scope("evidence_packs"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "findings" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("findings"."shop_id")) WITH CHECK (hold_in_scope("findings"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "marks" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("marks"."shop_id")) WITH CHECK (hold_in_scope("marks"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "photos" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("photos"."shop_id")) WITH CHECK (hold_in_scope("photos"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "audit_log" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("audit_log"."shop_id")) WITH CHECK (hold_in_scope("audit_log"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "outbox" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("outbox"."shop_id")) WITH CHECK (hold_in_scope("outbox"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "renter_links" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("renter_links"."shop_id")) WITH CHECK (hold_in_scope("renter_links"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "executions" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("executions"."shop_id")) WITH CHECK (hold_in_scope("executions"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "invoices" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("invoices"."shop_id")) WITH CHECK (hold_in_scope("invoices"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "money_events" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("money_events"."shop_id")) WITH CHECK (hold_in_scope("money_events"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "paypal_events" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("paypal_events"."shop_id")) WITH CHECK (hold_in_scope("paypal_events"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "authorizations" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("authorizations"."shop_id")) WITH CHECK (hold_in_scope("authorizations"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "holds" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("holds"."shop_id")) WITH CHECK (hold_in_scope("holds"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "rental_items" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("rental_items"."shop_id")) WITH CHECK (hold_in_scope("rental_items"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "rentals" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("rentals"."shop_id")) WITH CHECK (hold_in_scope("rentals"."shop_id"));--> statement-breakpoint
CREATE POLICY "renter_of_shop" ON "renters" AS PERMISSIVE FOR SELECT TO "hold_app", "hold_worker" USING (exists (select 1 from rentals where rentals.renter_id = "renters"."id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "paypal_accounts" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("paypal_accounts"."shop_id")) WITH CHECK (hold_in_scope("paypal_accounts"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "shops" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("shops"."id")) WITH CHECK (hold_in_scope("shops"."id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "staff_roles" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("staff_roles"."shop_id")) WITH CHECK (hold_in_scope("staff_roles"."shop_id"));--> statement-breakpoint
CREATE POLICY "self_or_colleague" ON "users" AS PERMISSIVE FOR SELECT TO "hold_app", "hold_worker" USING ("users"."id" = hold_scope_user() or exists (select 1 from staff_roles where staff_roles.user_id = "users"."id" and staff_roles.shop_id = hold_scope_shop()));--> statement-breakpoint
CREATE POLICY "self_update" ON "users" AS PERMISSIVE FOR UPDATE TO "hold_app" USING ("users"."id" = hold_scope_user());--> statement-breakpoint
CREATE POLICY "sign_up" ON "users" AS PERMISSIVE FOR INSERT TO "hold_app" WITH CHECK (true);