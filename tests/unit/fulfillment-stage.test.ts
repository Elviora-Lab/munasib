import { describe, expect, it } from 'vitest';

import {
  deriveFulfillmentStage,
  fulfillmentAgeLabel,
  isFulfillmentLeftover,
} from '@/lib/fulfillment-stage';

describe('fulfillment-stage', () => {
  const booked = {
    trackingNumber: 'CX-1',
    createdAt: new Date('2026-09-07T10:00:00+05:00'),
    labelPrintedAt: null,
    packedAt: null,
  };

  it('derives stages from shipment timestamps', () => {
    expect(deriveFulfillmentStage(null)).toBe('NEEDS_BOOKING');
    expect(deriveFulfillmentStage(booked)).toBe('BOOKED');
    expect(
      deriveFulfillmentStage({
        ...booked,
        labelPrintedAt: new Date('2026-09-07T11:00:00+05:00'),
      }),
    ).toBe('PRINTED');
    expect(
      deriveFulfillmentStage({
        ...booked,
        labelPrintedAt: new Date('2026-09-07T11:00:00+05:00'),
        packedAt: new Date('2026-09-07T12:00:00+05:00'),
      }),
    ).toBe('PACKED');
  });

  it('flags leftover relative to Karachi calendar day', () => {
    const now = new Date('2026-09-07T14:00:00+05:00');
    expect(
      isFulfillmentLeftover(
        {
          ...booked,
          createdAt: new Date('2026-09-06T18:00:00+05:00'),
        },
        now,
      ),
    ).toBe(true);
    expect(isFulfillmentLeftover(booked, now)).toBe(false);
    expect(
      fulfillmentAgeLabel({ ...booked, createdAt: new Date('2026-09-06T18:00:00+05:00') }, now),
    ).toBe('Yesterday');
  });
});
