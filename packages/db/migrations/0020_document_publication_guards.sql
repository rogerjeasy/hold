-- Initial publication state is protected on INSERT as well as UPDATE.
ALTER TABLE evidence_packs DROP CONSTRAINT evidence_ready_complete;--> statement-breakpoint
ALTER TABLE evidence_packs ADD CONSTRAINT evidence_ready_complete CHECK (
  state <> 'ready' OR (
    pdf_sha256 IS NOT NULL AND pdf_sha256 ~ '^[a-f0-9]{64}$' AND
    manifest_fingerprint ~ '^[a-f0-9]{64}$' AND
    pdf_version_id IS NOT NULL AND length(pdf_version_id) > 0 AND
    manifest_version_id IS NOT NULL AND length(manifest_version_id) > 0 AND
    snapshot_version_id IS NOT NULL AND length(snapshot_version_id) > 0
  )
);--> statement-breakpoint
CREATE FUNCTION hold_initial_document_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'evidence_packs' THEN
    IF NEW.state <> 'building' OR NEW.pdf_sha256 IS NOT NULL OR NEW.pdf_version_id IS NOT NULL OR
       NEW.manifest_version_id IS NOT NULL OR NEW.snapshot_version_id IS NOT NULL OR NEW.manifest_fingerprint <> '' OR
       NEW.evidence_key <> 'packs/' || NEW.shop_id::text || '/' || NEW.rental_id::text || '/' || NEW.version::text || '/record.pdf' THEN
      RAISE EXCEPTION 'A document must be reserved before worker publication';
    END IF;
  ELSE
    IF NEW.status <> 'queued' OR NEW.sent_at IS NOT NULL OR NEW.lease_owner IS NOT NULL OR NEW.lease_until IS NOT NULL OR NEW.attempts <> 0 THEN
      RAISE EXCEPTION 'A receipt must be queued before worker delivery';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER evidence_initial BEFORE INSERT ON evidence_packs FOR EACH ROW EXECUTE FUNCTION hold_initial_document_state();--> statement-breakpoint
CREATE TRIGGER receipt_initial BEFORE INSERT ON receipt_deliveries FOR EACH ROW EXECUTE FUNCTION hold_initial_document_state();
