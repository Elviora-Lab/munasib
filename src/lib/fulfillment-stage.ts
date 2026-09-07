/**
 * Kitchen fulfillment stages derived from shipment timestamps.
 * Customer-facing OrderStatus stays unchanged; this is floor ops only.
 */
export type FulfillmentStage = 'NEEDS_BOOKING' | 'BOOKED' | 'PRINTED' | 'PACKED';

export const FULFILLMENT_STAGES: FulfillmentStage[] = [
  'NEEDS_BOOKING',
  'BOOKED',
  'PRINTED',
  'PACKED',
];

export const FULFILLMENT_STAGE_LABEL: Record<FulfillmentStage, string> = {
  NEEDS_BOOKING: 'Needs booking',
  BOOKED: 'Booked',
  PRINTED: 'Printed',
  PACKED: 'Packed',
};

export type ShipmentFulfillmentFields = {
  trackingNumber: string | null;
  createdAt: Date;
  labelPrintedAt: Date | null;
  packedAt: Date | null;
};

/** Derive stage from the primary shipment (or lack of one). */
export function deriveFulfillmentStage(
  shipment: ShipmentFulfillmentFields | null | undefined,
): FulfillmentStage {
  if (!shipment?.trackingNumber?.trim()) return 'NEEDS_BOOKING';
  if (!shipment.labelPrintedAt) return 'BOOKED';
  if (!shipment.packedAt) return 'PRINTED';
  return 'PACKED';
}

/** Calendar date in Asia/Karachi as YYYY-MM-DD. */
export function karachiDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * True when the order's current stage started before today (Pakistan time).
 * Reference: packed → printed → booked (shipment createdAt).
 */
export function isFulfillmentLeftover(
  shipment: ShipmentFulfillmentFields | null | undefined,
  now = new Date(),
): boolean {
  if (!shipment?.trackingNumber?.trim()) return false;
  const reference = shipment.packedAt ?? shipment.labelPrintedAt ?? shipment.createdAt;
  return karachiDateKey(reference) < karachiDateKey(now);
}

/** Short age label for leftover rows, e.g. "Yesterday", "2d ago". */
export function fulfillmentAgeLabel(
  shipment: ShipmentFulfillmentFields | null | undefined,
  now = new Date(),
): string | null {
  if (!isFulfillmentLeftover(shipment, now) || !shipment) return null;
  const reference = shipment.packedAt ?? shipment.labelPrintedAt ?? shipment.createdAt;
  const startToday = Date.parse(`${karachiDateKey(now)}T00:00:00+05:00`);
  const startRef = Date.parse(`${karachiDateKey(reference)}T00:00:00+05:00`);
  const days = Math.max(1, Math.round((startToday - startRef) / 86_400_000));
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}
