ALTER TABLE "evidence_packs" ADD COLUMN "snapshot" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD COLUMN "source_fingerprint" text NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD COLUMN "state" text DEFAULT 'building' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD COLUMN "renderer_version" text DEFAULT 'evidence-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD COLUMN "pdf_sha256" text;--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD COLUMN "pdf_version_id" text;--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD COLUMN "manifest_version_id" text;--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD COLUMN "snapshot_version_id" text;--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "evidence_packs" ADD CONSTRAINT "evidence_packs_rentalId_sourceFingerprint_unique" UNIQUE("rental_id","source_fingerprint");--> statement-breakpoint
ALTER TABLE evidence_packs ADD CONSTRAINT evidence_build_state CHECK (state IN ('building', 'ready', 'failed'));--> statement-breakpoint
ALTER TABLE evidence_packs ADD CONSTRAINT evidence_ready_complete CHECK (state <> 'ready' OR (pdf_sha256 ~ '^[a-f0-9]{64}$' AND manifest_fingerprint ~ '^[a-f0-9]{64}$' AND pdf_version_id IS NOT NULL AND manifest_version_id IS NOT NULL AND snapshot_version_id IS NOT NULL));--> statement-breakpoint
REVOKE UPDATE ON evidence_packs FROM hold_app, hold_worker;--> statement-breakpoint
GRANT UPDATE (state, pdf_sha256, manifest_fingerprint, pdf_version_id, manifest_version_id, snapshot_version_id, last_error) ON evidence_packs TO hold_worker;--> statement-breakpoint
CREATE FUNCTION hold_immutable_pack() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'ready' OR
     (to_jsonb(OLD) - ARRAY['state','pdf_sha256','manifest_fingerprint','pdf_version_id','manifest_version_id','snapshot_version_id','last_error']) IS DISTINCT FROM
     (to_jsonb(NEW) - ARRAY['state','pdf_sha256','manifest_fingerprint','pdf_version_id','manifest_version_id','snapshot_version_id','last_error']) THEN
    RAISE EXCEPTION 'Evidence versions are immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER evidence_immutable BEFORE UPDATE ON evidence_packs FOR EACH ROW EXECUTE FUNCTION hold_immutable_pack();
