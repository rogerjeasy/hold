-- The guided handover (architecture.md section 11.2): a retake keeps the photograph it replaces on record, a sealed
-- session keeps its manifest and the marks staff confirmed, a renter may add what staff missed, and the rental keeps
-- the renter's answer to the condition report.
ALTER TABLE "photos" DROP CONSTRAINT "photos_sessionId_view_unique";--> statement-breakpoint
ALTER TABLE "capture_sessions" DROP CONSTRAINT "kind_allowed";--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD COLUMN "manifest" text;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD COLUMN "confirmed_mark_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "condition_reply" text;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "condition_replied_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "photos_current_view_unique" ON "photos" USING btree ("session_id","view") WHERE "photos"."superseded_at" is null;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "kind_allowed" CHECK ("capture_sessions"."kind" in ('handover', 'return', 'packing', 'unboxing', 'send_back', 'condition'));--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "conditionReply_allowed" CHECK ("rentals"."condition_reply" in ('confirmed', 'added'));--> statement-breakpoint

-- A photograph's fingerprint, its original and when it arrived are evidence: no service may change them. Only the
-- display copy, the perceptual fingerprint and a retake's mark may be written after it is recorded.
REVOKE UPDATE ON "photos" FROM hold_app, hold_worker;
--> statement-breakpoint
GRANT UPDATE ("display_key", "perceptual_hash", "superseded_at") ON "photos" TO hold_app, hold_worker;
