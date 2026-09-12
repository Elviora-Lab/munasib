import { OrderStatus, ShipmentStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  hasPostExPickupInTracking,
  isPostExPickedUpStatus,
  isPostExPostPickupStatus,
  isPostExPrePickupStatus,
  mapPostExStatus,
  resolvePostExCurrentStatus,
  resolvePostExJourneyText,
  toPostExPhone,
} from '@/server/shipping/postex';

describe('PostEx phone normalization', () => {
  it('normalizes Pakistan mobile formats to local 03xxxxxxxxx form', () => {
    expect(toPostExPhone('+92 300 1234567')).toBe('03001234567');
    expect(toPostExPhone('0092-301-1234567')).toBe('03011234567');
    expect(toPostExPhone('3021234567')).toBe('03021234567');
  });

  it('leaves already-local numbers in local form', () => {
    expect(toPostExPhone('03031234567')).toBe('03031234567');
  });
});

describe('PostEx status mapping', () => {
  it('keeps pre-pickup statuses at label-created without marking shipped', () => {
    expect(isPostExPrePickupStatus("At Merchant's Warehouse")).toBe(true);
    expect(isPostExPrePickupStatus('At Munasib Warehouse')).toBe(true);
    expect(isPostExPrePickupStatus('Unbooked')).toBe(true);
    expect(isPostExPrePickupStatus('Booked')).toBe(true);
    expect(isPostExPrePickupStatus('At PostEx Warehouse')).toBe(false);
    expect(isPostExPrePickupStatus('Unknown')).toBe(false);
    expect(mapPostExStatus("At Merchant's Warehouse")).toEqual({
      shipment: ShipmentStatus.LABEL_CREATED,
      terminal: false,
    });
    expect(mapPostExStatus('At Munasib Warehouse')).toEqual({
      shipment: ShipmentStatus.LABEL_CREATED,
      terminal: false,
    });
    expect(mapPostExStatus('Booked')).toEqual({
      shipment: ShipmentStatus.LABEL_CREATED,
      terminal: false,
    });
    expect(mapPostExStatus('Unbooked')).toEqual({
      shipment: ShipmentStatus.LABEL_CREATED,
      terminal: false,
    });
  });

  it('does not invent in-transit for unrecognized statuses', () => {
    expect(mapPostExStatus('Unknown')).toEqual({
      shipment: ShipmentStatus.LABEL_CREATED,
      terminal: false,
    });
    expect(mapPostExStatus('')).toEqual({
      shipment: ShipmentStatus.LABEL_CREATED,
      terminal: false,
    });
    expect(mapPostExStatus('Some Future PostEx Label')).toEqual({
      shipment: ShipmentStatus.LABEL_CREATED,
      terminal: false,
    });
  });

  it('marks the order shipped only on Picked By PostEx', () => {
    expect(isPostExPickedUpStatus('Picked By PostEx')).toBe(true);
    expect(mapPostExStatus('Picked By PostEx')).toEqual({
      shipment: ShipmentStatus.IN_TRANSIT,
      order: OrderStatus.SHIPPED,
      terminal: false,
    });
  });

  it('updates shipment for in-transit steps without marking the order shipped', () => {
    expect(mapPostExStatus('At PostEx Warehouse')).toEqual({
      shipment: ShipmentStatus.IN_TRANSIT,
      terminal: false,
    });
    expect(mapPostExStatus('Package on Root')).toEqual({
      shipment: ShipmentStatus.IN_TRANSIT,
      terminal: false,
    });
    expect(mapPostExStatus('Out For Delivery')).toEqual({
      shipment: ShipmentStatus.OUT_FOR_DELIVERY,
      terminal: false,
    });
    expect(mapPostExStatus('Attempt Made: Customer not available')).toEqual({
      shipment: ShipmentStatus.IN_TRANSIT,
      terminal: false,
    });
    expect(mapPostExStatus('In-Transit')).toEqual({
      shipment: ShipmentStatus.IN_TRANSIT,
      terminal: false,
    });
    expect(mapPostExStatus('En-Route to Lahore warehouse')).toEqual({
      shipment: ShipmentStatus.IN_TRANSIT,
      terminal: false,
    });
    expect(mapPostExStatus('Departed to PostEx. Warehouse')).toEqual({
      shipment: ShipmentStatus.IN_TRANSIT,
      terminal: false,
    });
  });

  it('treats clear courier-progress statuses as post-pickup', () => {
    expect(isPostExPostPickupStatus('Picked By PostEx')).toBe(true);
    expect(isPostExPostPickupStatus('At PostEx Warehouse')).toBe(true);
    expect(isPostExPostPickupStatus('Departed to PostEx. Warehouse')).toBe(true);
    expect(isPostExPostPickupStatus('En-Route to Lahore warehouse')).toBe(true);
    expect(isPostExPostPickupStatus('Package on Root')).toBe(true);
    expect(isPostExPostPickupStatus('Out For Delivery')).toBe(true);
    expect(isPostExPostPickupStatus('Attempt Made: Customer not available')).toBe(true);
    expect(isPostExPostPickupStatus("At Merchant's Warehouse")).toBe(false);
    expect(isPostExPostPickupStatus('At Munasib Warehouse')).toBe(false);
    expect(isPostExPostPickupStatus('Booked')).toBe(false);
  });

  it('detects pickup from journey history when current status has moved on', () => {
    expect(
      hasPostExPickupInTracking({
        transactionStatus: 'In-Transit',
        transactionStatusHistory: [
          {
            transactionStatusMessage: "At Merchant's Warehouse",
            transactionStatusMessageCode: '0001',
          },
          { transactionStatusMessage: 'Picked By PostEx', transactionStatusMessageCode: '0015' },
          { transactionStatusMessage: 'At PostEx Warehouse', transactionStatusMessageCode: '0003' },
        ],
      }),
    ).toBe(true);
    expect(mapPostExStatus('In-Transit')).toEqual({
      shipment: ShipmentStatus.IN_TRANSIT,
      terminal: false,
    });
  });

  it('prefers transactionStatus over history when resolving current step', () => {
    expect(
      resolvePostExCurrentStatus({
        transactionStatus: 'Picked By PostEx',
        transactionStatusHistory: [
          {
            transactionStatusMessage: "At Merchant's Warehouse",
            transactionStatusMessageCode: '0001',
          },
          { transactionStatusMessage: 'Picked By PostEx', transactionStatusMessageCode: '0015' },
        ],
      }),
    ).toBe('Picked By PostEx');
  });

  it('keeps PostEx journey text separate from the broad status', () => {
    const tracking = {
      transactionStatus: 'In-Transit',
      transactionStatusMessage: 'En-Route to PHALIA warehouse',
    };

    expect(resolvePostExCurrentStatus(tracking)).toBe('In-Transit');
    expect(resolvePostExJourneyText(tracking)).toBe('En-Route to PHALIA warehouse');
  });

  it('picks the highest status code from history when summary is absent', () => {
    expect(
      resolvePostExCurrentStatus({
        transactionStatusHistory: [
          {
            transactionStatusMessage: "At Merchant's Warehouse",
            transactionStatusMessageCode: '0001',
          },
          { transactionStatusMessage: 'At PostEx Warehouse', transactionStatusMessageCode: '0003' },
        ],
      }),
    ).toBe('At PostEx Warehouse');
  });

  it('maps delivered and returned statuses to terminal order states', () => {
    expect(mapPostExStatus('Delivered')).toEqual({
      shipment: ShipmentStatus.DELIVERED,
      order: OrderStatus.DELIVERED,
      terminal: true,
    });
    expect(mapPostExStatus('Out For Return')).toEqual({
      shipment: ShipmentStatus.RETURNED,
      order: OrderStatus.RETURNED,
      terminal: true,
    });
  });
});
