-- Fulfillment stage timestamps for kitchen floor (booked → printed → packed).
ALTER TABLE "shipments"
  ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "label_printed_at" TIMESTAMPTZ,
  ADD COLUMN "label_printed_by" UUID,
  ADD COLUMN "packed_at" TIMESTAMPTZ,
  ADD COLUMN "packed_by" UUID;

-- Backfill book time from first tracking sync when available.
UPDATE "shipments"
SET "created_at" = COALESCE("tracking_synced_at", "shipped_at", CURRENT_TIMESTAMP)
WHERE "tracking_synced_at" IS NOT NULL OR "shipped_at" IS NOT NULL;

CREATE INDEX "shipments_created_at_idx" ON "shipments"("created_at");
CREATE INDEX "shipments_label_printed_at_idx" ON "shipments"("label_printed_at");
CREATE INDEX "shipments_packed_at_idx" ON "shipments"("packed_at");
