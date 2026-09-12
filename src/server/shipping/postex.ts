import 'server-only';

import { unstable_cache } from 'next/cache';
import { OrderStatus, ShipmentStatus } from '@prisma/client';

import { serverEnv } from '@/config/env';

import { BadRequestError } from '@/server/http/errors';

/**
 * PostEx (Pakistan) merchant API client.
 * Docs: https://api.postex.pk · auth via the `token` header.
 * All calls are no-ops-by-throw when POSTEX_API_TOKEN is unset — callers should
 * gate on `isPostExConfigured()`.
 */
const BASE_URL = 'https://api.postex.pk';

type PostExEnvelope<T> = {
  statusCode?: string | number;
  statusMessage?: string;
  dist?: T;
};

export type PostExOperationalCity = {
  operationalCityName: string;
  countryName: string;
  isPickupCity: boolean;
  isDeliveryCity: boolean;
};

export type PostExPickupAddress = {
  phone1: string;
  phone2: string;
  contactPersonName: string;
  cityName: string;
  address: string;
  addressCode: string;
};

export type CreatePostExPickupAddressInput = {
  address: string;
  addressTypeId: 1 | 2;
  cityName: string;
  contactPersonName: string;
  phone1: string;
  phone2: string;
  phone3?: string;
  wareHouseManagerName?: string;
};

export type PostExOrderRow = Record<string, unknown> & {
  orderRefNumber?: string;
  trackingNumber?: string;
  transactionStatus?: string;
  transactionStatusMessage?: string;
  journey?: string;
  journeyStatus?: string;
  cityName?: string;
  customerName?: string;
  customerPhone?: string;
  invoicePayment?: number;
  transactionDate?: string;
};

export type PostExTrackingHistoryRow = {
  transactionStatusMessage?: string;
  transactionStatusMessageCode?: string;
};

export type PostExTrackingDetail = PostExOrderRow & {
  transactionStatusHistory?: PostExTrackingHistoryRow[];
};

export type PostExBulkTrackingRow = {
  trackingNumber: string;
  message?: string;
  trackingResponse?: PostExTrackingDetail;
};

export type PostExShipperAdviceRow = {
  remarks: string;
  remarksDate: string;
  username: string;
};

export type PostExShipperAdvice = {
  trackingNumber: string;
  message?: string;
  trackingResponse: PostExShipperAdviceRow[];
};

export function isPostExConfigured(): boolean {
  return Boolean(serverEnv.POSTEX_API_TOKEN);
}

/**
 * PostEx's create-order API requires the customer phone in strict local format
 * `03xxxxxxxxx`. Our checkout only validates length (6–32 chars), so shoppers
 * type it every which way (+92, 0092, spaces, dashes, or a bare `3xx…`). We
 * coerce all of those to the one shape PostEx accepts, otherwise the booking is
 * rejected. Returns the digits unchanged if it can't confidently reshape them.
 */
export function toPostExPhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('0092'))
    d = d.slice(4); // 0092 300… → 300…
  else if (d.startsWith('92') && d.length === 12) d = d.slice(2); // 92 300… → 300…
  if (!d.startsWith('0')) d = `0${d}`; // 300… → 0300…
  return d;
}

async function postexFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = serverEnv.POSTEX_API_TOKEN;
  if (!token) throw new Error('PostEx is not configured (POSTEX_API_TOKEN missing)');

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', token, ...(init?.headers ?? {}) },
    cache: 'no-store',
  });

  const json = (await res.json().catch(() => null)) as {
    statusCode?: string;
    statusMessage?: string;
    dist?: unknown;
  } | null;

  // PostEx returns HTTP 200 with a `statusCode` ("200" on success). Surface its
  // message as an HttpError so admin server-actions show the real reason
  // (e.g. "invalid city", "duplicate order reference") instead of a generic
  // "Something went wrong" toast.
  if (!res.ok || (json?.statusCode && String(json.statusCode) !== '200')) {
    throw new BadRequestError(
      `PostEx: ${json?.statusMessage || `request failed (HTTP ${res.status})`}`,
    );
  }
  return json as T;
}

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const text = qs.toString();
  return text ? `${path}?${text}` : path;
}

function cleanBody<T extends Record<string, unknown>>(body: T): T {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined && value !== ''),
  ) as T;
}

export type CreatePostExOrderInput = {
  cityName: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  /** COD amount to collect (0 for prepaid). */
  invoicePayment: number;
  /** Number of pieces in the parcel. */
  items: number;
  orderRefNumber: string;
  orderDetail?: string;
  orderType?: string;
};

/** Book a parcel with PostEx. Returns the assigned tracking number. */
export async function createPostExOrder(
  input: CreatePostExOrderInput,
): Promise<{ trackingNumber: string }> {
  const body = {
    cityName: input.cityName,
    customerName: input.customerName,
    customerPhone: toPostExPhone(input.customerPhone),
    deliveryAddress: input.deliveryAddress,
    invoiceDivision: 1,
    invoicePayment: Math.round(input.invoicePayment),
    items: Math.max(1, input.items),
    orderRefNumber: input.orderRefNumber,
    orderType: input.orderType ?? 'Normal',
    ...(input.orderDetail ? { orderDetail: input.orderDetail } : {}),
    ...(serverEnv.POSTEX_PICKUP_ADDRESS_CODE
      ? { pickupAddressCode: serverEnv.POSTEX_PICKUP_ADDRESS_CODE }
      : {}),
  };

  const json = await postexFetch<{ dist?: { trackingNumber?: string | number } }>(
    '/services/integration/api/order/v3/create-order',
    { method: 'POST', body: JSON.stringify(body) },
  );

  const trackingNumber = json.dist?.trackingNumber;
  if (!trackingNumber) throw new Error('PostEx did not return a tracking number');
  return { trackingNumber: String(trackingNumber) };
}

// ---------------------------------------------------------------------------
// Merchant setup/reference APIs.
// ---------------------------------------------------------------------------

/** List PostEx operational cities, optionally filtered by Pickup or Delivery. */
export async function getPostExOperationalCities(
  operationalCityType?: 'Pickup' | 'Delivery',
): Promise<PostExOperationalCity[]> {
  const json = await postexFetch<PostExEnvelope<Array<Record<string, unknown>>>>(
    withQuery('/services/integration/api/order/v2/get-operational-city', {
      operationalCityType,
    }),
    { method: 'GET' },
  );
  const rows = Array.isArray(json.dist) ? json.dist : [];
  return rows.map((r) => ({
    operationalCityName: String(r['operationalCityName'] ?? ''),
    countryName: String(r['countryName'] ?? ''),
    isPickupCity: r['isPickupCity'] === true || r['isPickupCity'] === 'true',
    isDeliveryCity: r['isDeliveryCity'] === true || r['isDeliveryCity'] === 'true',
  }));
}

/** List merchant pickup/return addresses registered with PostEx. */
export async function getPostExPickupAddresses(cityName?: string): Promise<PostExPickupAddress[]> {
  const json = await postexFetch<PostExEnvelope<Array<Record<string, unknown>>>>(
    withQuery('/services/integration/api/order/v1/get-merchant-address', { cityName }),
    { method: 'GET' },
  );
  const rows = Array.isArray(json.dist) ? json.dist : [];
  return rows.map((r) => ({
    phone1: String(r['phone1'] ?? ''),
    phone2: String(r['phone2'] ?? ''),
    contactPersonName: String(r['contactPersonName'] ?? ''),
    cityName: String(r['cityName'] ?? ''),
    address: String(r['address'] ?? ''),
    addressCode: String(r['addressCode'] ?? ''),
  }));
}

/** Create a merchant pickup/return address in PostEx. */
export async function createPostExPickupAddress(
  input: CreatePostExPickupAddressInput,
): Promise<{ statusMessage: string }> {
  const json = await postexFetch<PostExEnvelope<unknown>>(
    '/services/integration/api/order/v2/create-merchant-address',
    { method: 'POST', body: JSON.stringify(cleanBody(input)) },
  );
  return { statusMessage: json.statusMessage ?? 'SUCCESSFULLY OPERATED' };
}

/** List supported PostEx order types: Normal, Reversed, Replacement. */
export async function getPostExOrderTypes(): Promise<string[]> {
  const json = await postexFetch<PostExEnvelope<string[]>>(
    '/services/integration/api/order/v1/get-order-types',
    { method: 'GET' },
  );
  return Array.isArray(json.dist) ? json.dist.map(String) : [];
}

/** List supported PostEx order statuses. */
export async function getPostExOrderStatuses(): Promise<string[]> {
  const json = await postexFetch<PostExEnvelope<string[]>>(
    '/services/integration/api/order/v1/get-order-status',
    { method: 'GET' },
  );
  return Array.isArray(json.dist) ? json.dist.map(String) : [];
}

// ---------------------------------------------------------------------------
// Order listing/tracking APIs.
// ---------------------------------------------------------------------------

/** List unbooked orders in PostEx for a date range. */
export async function listPostExUnbookedOrders(input: {
  startDate: string;
  endDate: string;
  cityName?: string;
}): Promise<PostExOrderRow[]> {
  const json = await postexFetch<PostExEnvelope<PostExOrderRow[]>>(
    withQuery('/services/integration/api/order/v2/get-unbooked-orders', input),
    { method: 'GET' },
  );
  return Array.isArray(json.dist) ? json.dist : [];
}

/** List PostEx orders by status id and date range. Use 0 for every status. */
export async function listPostExOrders(input: {
  orderStatusID: number;
  fromDate: string;
  toDate: string;
}): Promise<PostExBulkTrackingRow[]> {
  const json = await postexFetch<PostExEnvelope<PostExBulkTrackingRow[]>>(
    withQuery('/services/integration/api/order/v1/get-all-order', input),
    { method: 'GET' },
  );
  return Array.isArray(json.dist) ? json.dist : [];
}

/** Fetch the full tracking detail for a consignment. */
export async function getPostExTrackingDetail(
  trackingNumber: string,
): Promise<PostExTrackingDetail> {
  const json = await postexFetch<PostExEnvelope<PostExTrackingDetail>>(
    `/services/integration/api/order/v1/track-order/${encodeURIComponent(trackingNumber)}`,
    { method: 'GET' },
  );
  return json.dist ?? {};
}

function textField(row: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = row[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function latestPostExHistoryRow(
  history: PostExTrackingHistoryRow[],
): PostExTrackingHistoryRow | null {
  if (history.length === 0) return null;

  const coded = history.filter((row) => row.transactionStatusMessageCode);
  if (coded.length > 0) {
    return coded.reduce((best, row) => {
      const code = Number.parseInt(String(row.transactionStatusMessageCode), 10);
      const bestCode = Number.parseInt(String(best.transactionStatusMessageCode), 10);
      return code > bestCode ? row : best;
    });
  }

  return history[history.length - 1] ?? null;
}

/** Fetch the latest tracking status for a consignment. Best-effort message. */
export function resolvePostExCurrentStatus(dist: PostExTrackingDetail): string {
  // PostEx sets `transactionStatus` to the parcel's current step in the portal.
  const summary = textField(dist, ['transactionStatus', 'status', 'orderStatus']);
  if (summary) return summary;

  const history = Array.isArray(dist.transactionStatusHistory) ? dist.transactionStatusHistory : [];
  const latest = latestPostExHistoryRow(history);
  if (latest?.transactionStatusMessage) return latest.transactionStatusMessage;

  return 'Unknown';
}

/** Fetch the human journey/location message PostEx shows beside the status. */
export function resolvePostExJourneyText(dist: PostExTrackingDetail): string | null {
  const status = resolvePostExCurrentStatus(dist);
  const direct = textField(dist, [
    'journey',
    'journeyStatus',
    'transactionStatusMessage',
    'trackingMessage',
    'currentStatusMessage',
  ]);
  if (direct && direct !== status) return direct;

  const history = Array.isArray(dist.transactionStatusHistory) ? dist.transactionStatusHistory : [];
  const latest = latestPostExHistoryRow(history)?.transactionStatusMessage?.trim();
  if (latest && latest !== status) return latest;

  return direct ?? null;
}

/** Fetch the latest tracking status for a consignment. Best-effort message. */
export async function trackPostExOrder(
  trackingNumber: string,
): Promise<{ status: string; journey: string | null; pickedUp: boolean }> {
  const dist = await getPostExTrackingDetail(trackingNumber);
  return {
    status: resolvePostExCurrentStatus(dist),
    journey: resolvePostExJourneyText(dist),
    pickedUp: hasPostExPickupInTracking(dist),
  };
}

/** Track multiple PostEx consignments in one call. */
export async function bulkTrackPostExOrders(
  trackingNumbers: string[],
): Promise<PostExBulkTrackingRow[]> {
  const list = trackingNumbers
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50);
  if (list.length === 0) throw new Error('No tracking numbers provided');
  const json = await postexFetch<PostExEnvelope<PostExBulkTrackingRow[]>>(
    withQuery('/services/integration/api/order/v1/track-bulk-order', {
      trackingNumber: list.join(','),
    }),
    { method: 'GET' },
  );
  return Array.isArray(json.dist) ? json.dist : [];
}

// ---------------------------------------------------------------------------
// Operational cities — used to warn shoppers at checkout when PostEx does not
// deliver to their city (an undeliverable COD order is a wasted courier fee).
// ---------------------------------------------------------------------------

const normalizeCityName = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

async function loadPostExDeliveryCityNames(): Promise<string[]> {
  if (!isPostExConfigured()) return [];
  const rows = await getPostExOperationalCities();
  return rows
    .filter((r) => r.isDeliveryCity)
    .map((r) => r.operationalCityName.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

/** PostEx delivery cities with official spelling — for checkout city picker. */
export const getPostExDeliveryCities = unstable_cache(
  async (): Promise<string[]> => {
    try {
      return await loadPostExDeliveryCityNames();
    } catch {
      return [];
    }
  },
  ['postex-delivery-cities-v1'],
  { revalidate: 60 * 60 * 24, tags: ['postex-cities'] },
);

/** Whether a city matches a PostEx delivery city (case/spacing insensitive). */
export async function isPostExDeliveryCity(city: string): Promise<boolean> {
  const cities = await getPostExDeliveryCities();
  if (cities.length === 0) return true;
  const key = normalizeCityName(city);
  return cities.some((c) => normalizeCityName(c) === key);
}

/**
 * The set of cities PostEx delivers to, normalized to lowercase. Cached for a
 * day (this list barely changes) and never throws — an outage returns an empty
 * set so checkout degrades to "no warning" rather than blocking the sale.
 */
const getServiceableCitiesCached = unstable_cache(
  async (): Promise<string[]> => {
    try {
      const cities = await getPostExDeliveryCities();
      return cities.map(normalizeCityName).filter(Boolean);
    } catch {
      return [];
    }
  },
  ['postex-serviceable-cities-v3'],
  { revalidate: 60 * 60 * 24, tags: ['postex-cities'] },
);

/**
 * Is a city deliverable by PostEx? Returns `null` when we can't tell (PostEx
 * unconfigured or the city list is unavailable) so callers show no warning
 * rather than a false one.
 */
export async function isPostExCityServiceable(city: string): Promise<boolean | null> {
  const cities = await getServiceableCitiesCached();
  if (cities.length === 0) return null;
  return cities.includes(normalizeCityName(city));
}

// ---------------------------------------------------------------------------
// Airway Bill (shipping label) — PostEx accepts ≤10 tracking numbers per
// request; we chunk and merge so callers can print any selection size.
// ---------------------------------------------------------------------------

const POSTEX_AWB_CHUNK = 10;
/** Fail before Vercel FUNCTION_INVOCATION_TIMEOUT when PostEx hangs. */
const POSTEX_AWB_TIMEOUT_MS = 25_000;

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) ||
    (typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      err.name === 'AbortError')
  );
}

/** Fetch one PostEx AWB PDF chunk (≤10 tracking numbers). */
async function fetchPostExAirwayBillChunk(
  token: string,
  trackingNumbers: string[],
): Promise<ArrayBuffer> {
  const list = trackingNumbers.map((t) => t.trim()).filter(Boolean);
  if (list.length === 0) throw new Error('No tracking numbers provided');
  if (list.length > POSTEX_AWB_CHUNK) {
    throw new Error(`PostEx AWB chunk exceeds ${POSTEX_AWB_CHUNK} tracking numbers`);
  }

  const qs = new URLSearchParams({ trackingNumbers: list.join(',') });
  // PostEx docs/SDK use hyphenated `get-invoice` — `getinvoice` returns HTTP 404.
  let res: Response;
  try {
    res = await fetch(
      `${BASE_URL}/services/integration/api/order/v1/get-invoice?${qs.toString()}`,
      {
        method: 'GET',
        headers: { token },
        cache: 'no-store',
        signal: AbortSignal.timeout(POSTEX_AWB_TIMEOUT_MS),
      },
    );
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error(
        `PostEx AWB timed out after ${POSTEX_AWB_TIMEOUT_MS / 1000}s (${list.length} tracking)`,
      );
    }
    throw err;
  }

  // On an invalid tracking number PostEx replies HTTP 200 with a JSON error
  // envelope instead of a PDF — surface its message rather than a corrupt file.
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || contentType.includes('application/json')) {
    const json = (await res.json().catch(() => null)) as {
      statusMessage?: string;
      message?: string;
      error?: string;
    } | null;
    throw new Error(
      json?.statusMessage ||
        json?.message ||
        json?.error ||
        `PostEx label failed (HTTP ${res.status})`,
    );
  }
  return res.arrayBuffer();
}

/**
 * Fetch PostEx AWB PDFs keyed by tracking number (one PDF blob per tracking).
 * Batches up to 10 trackings per API call; splits pages when PostEx returns
 * one page per tracking. Falls back to per-tracking fetch if page counts differ.
 */
export async function getPostExAirwayBillsByTracking(
  trackingNumbers: string[],
): Promise<Map<string, Uint8Array>> {
  const token = serverEnv.POSTEX_API_TOKEN;
  if (!token) throw new Error('PostEx is not configured (POSTEX_API_TOKEN missing)');

  const list = [...new Set(trackingNumbers.map((t) => t.trim()).filter(Boolean))];
  const out = new Map<string, Uint8Array>();
  if (list.length === 0) return out;

  const { PDFDocument } = await import('pdf-lib');

  async function storeSinglePage(
    tracking: string,
    source: Awaited<ReturnType<typeof PDFDocument.load>>,
    pageIndex: number,
  ) {
    const one = await PDFDocument.create();
    const [page] = await one.copyPages(source, [pageIndex]);
    one.addPage(page!);
    out.set(tracking, await one.save());
  }

  async function fetchOne(tracking: string) {
    const bytes = await fetchPostExAirwayBillChunk(token!, [tracking]);
    out.set(tracking, new Uint8Array(bytes));
  }

  for (let i = 0; i < list.length; i += POSTEX_AWB_CHUNK) {
    const chunk = list.slice(i, i + POSTEX_AWB_CHUNK);
    try {
      const bytes = await fetchPostExAirwayBillChunk(token, chunk);
      if (chunk.length === 1) {
        // Skip split/re-encode for the common single-label path.
        out.set(chunk[0]!, new Uint8Array(bytes));
        continue;
      }
      const doc = await PDFDocument.load(bytes);
      const indices = doc.getPageIndices();
      if (indices.length === chunk.length) {
        for (let j = 0; j < chunk.length; j++) {
          await storeSinglePage(chunk[j]!, doc, indices[j]!);
        }
      } else {
        // Ambiguous multi-order payload — fetch individually (still parallel).
        await Promise.all(chunk.map((t) => fetchOne(t)));
      }
    } catch (err) {
      // Don't re-hit PostEx with the same request (timeout / single tracking).
      if (chunk.length === 1 || isAbortError(err)) throw err;
      await Promise.all(chunk.map((t) => fetchOne(t)));
    }
  }

  return out;
}

/** Fetch PostEx AWB label PDF(s) for any number of tracking numbers (merged). */
export async function getPostExAirwayBill(trackingNumbers: string[]): Promise<ArrayBuffer> {
  const token = serverEnv.POSTEX_API_TOKEN;
  if (!token) throw new Error('PostEx is not configured (POSTEX_API_TOKEN missing)');

  const list = [...new Set(trackingNumbers.map((t) => t.trim()).filter(Boolean))];
  if (list.length === 0) throw new Error('No tracking numbers provided');

  if (list.length <= POSTEX_AWB_CHUNK) {
    return fetchPostExAirwayBillChunk(token, list);
  }

  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();

  for (let i = 0; i < list.length; i += POSTEX_AWB_CHUNK) {
    const chunk = list.slice(i, i + POSTEX_AWB_CHUNK);
    const bytes = await fetchPostExAirwayBillChunk(token, chunk);
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  const out = await merged.save();
  // Copy into a fresh ArrayBuffer — pdf-lib's Uint8Array may share a larger buffer.
  return out.slice().buffer;
}

/** Generate a PostEx load sheet PDF for a pickup handoff. */
export async function generatePostExLoadSheet(input: {
  trackingNumbers: string[];
  pickupAddress?: string;
}): Promise<ArrayBuffer> {
  const token = serverEnv.POSTEX_API_TOKEN;
  if (!token) throw new Error('PostEx is not configured (POSTEX_API_TOKEN missing)');

  const trackingNumbers = input.trackingNumbers.map((t) => t.trim()).filter(Boolean);
  if (trackingNumbers.length === 0) throw new Error('No tracking numbers provided');

  const res = await fetch(`${BASE_URL}/services/integration/api/order/v2/generate-load-sheet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', token },
    body: JSON.stringify(cleanBody({ trackingNumbers, pickupAddress: input.pickupAddress })),
    cache: 'no-store',
  });

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || contentType.includes('application/json')) {
    const json = (await res.json().catch(() => null)) as { statusMessage?: string } | null;
    throw new Error(json?.statusMessage || `PostEx load sheet failed (HTTP ${res.status})`);
  }
  return res.arrayBuffer();
}

// ---------------------------------------------------------------------------
// Cancel a booked consignment (§3.13).
// ---------------------------------------------------------------------------

/** Cancel a PostEx booking. Throws (HTTP 404) if the tracking number is unknown. */
export async function cancelPostExOrder(trackingNumber: string): Promise<void> {
  await postexFetch('/services/integration/api/order/v1/cancel-order', {
    method: 'PUT',
    body: JSON.stringify({ trackingNumber }),
  });
}

// ---------------------------------------------------------------------------
// Shipper advice (§3.11–3.12).
// ---------------------------------------------------------------------------

/** Save advice for an attempted parcel: 1 = return requested, 2 = retry attempt. */
export async function savePostExShipperAdvice(input: {
  trackingNumber: string;
  statusId: 1 | 2;
  remarks: string;
}): Promise<void> {
  await postexFetch('/service/integration/api/order/v2/save-shipper-advice', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

/** Read advice history for a tracking number. */
export async function getPostExShipperAdvice(
  trackingNumber: string,
): Promise<PostExShipperAdvice[]> {
  const json = await postexFetch<PostExEnvelope<PostExShipperAdvice[]>>(
    `/service/integration/api/order/v1/get-shipper-advice/${encodeURIComponent(trackingNumber)}`,
    { method: 'GET' },
  );
  return Array.isArray(json.dist) ? json.dist : [];
}

// ---------------------------------------------------------------------------
// COD payment / settlement status (§3.14).
// ---------------------------------------------------------------------------

export type PostExPaymentStatus = {
  /** True once PostEx has settled the collected COD cash to the merchant. */
  settled: boolean;
  settlementDate: string | null;
  /** Cash Payment Receipt number (upfront or reserve), for reconciliation. */
  cprNumber: string | null;
};

/** Fetch whether the COD for a consignment has been settled to the merchant. */
export async function getPostExPaymentStatus(trackingNumber: string): Promise<PostExPaymentStatus> {
  const json = await postexFetch<{ dist?: Record<string, unknown> }>(
    `/services/integration/api/order/v1/payment-status/${encodeURIComponent(trackingNumber)}`,
    { method: 'GET' },
  );
  const d = json.dist ?? {};
  return {
    settled: d['settle'] === true || d['settle'] === 'true',
    settlementDate: (d['settlementDate'] as string) || null,
    cprNumber: (d['cprNumber_1'] as string) || (d['cprNumber_2'] as string) || null,
  };
}

// ---------------------------------------------------------------------------
// Status mapping — PostEx's human status → our Shipment/Order enums.
// ---------------------------------------------------------------------------

/**
 * True when PostEx confirms the rider has collected the parcel from the merchant.
 * Order → SHIPPED only on this step; other in-transit statuses update the shipment row only.
 */
export function isPostExPickedUpStatus(raw: string): boolean {
  return raw.toLowerCase().includes('picked by postex');
}

/** True when the parcel is still with the merchant (label only — not collected yet). */
export function isPostExPrePickupStatus(raw: string): boolean {
  const s = raw.toLowerCase().trim();
  if (!s || s === 'unknown') return false;
  if (s.includes('unbooked') || s.includes('at merchant') || /\bbooked\b/.test(s)) return true;
  // PostEx uses the merchant brand: "At Munasib Warehouse" — still not collected.
  if (/\bat\b/.test(s) && s.includes('warehouse') && !/postex/.test(s)) return true;
  return false;
}

/** True when PostEx reports the parcel is already in the courier journey. */
export function isPostExPostPickupStatus(raw: string): boolean {
  const s = raw.toLowerCase();
  return (
    isPostExPickedUpStatus(raw) ||
    /postex\.?\s*warehouse/.test(s) ||
    s.includes('departed to postex') ||
    s.includes('on root') ||
    s.includes('en-route') ||
    s.includes('en route') ||
    s.includes('in-transit') ||
    s.includes('in transit') ||
    s.includes('under review') ||
    s.includes('attempt') ||
    s.includes('out for delivery')
  );
}

/** True when the rider pickup step appears in the current status or journey history. */
export function hasPostExPickupInTracking(dist: PostExTrackingDetail): boolean {
  if (isPostExPickedUpStatus(dist.transactionStatus ?? '')) return true;
  const history = Array.isArray(dist.transactionStatusHistory) ? dist.transactionStatusHistory : [];
  return history.some((row) => isPostExPickedUpStatus(row.transactionStatusMessage ?? ''));
}

/**
 * Translate a PostEx status message (from track-order or its history) into our
 * ShipmentStatus and the OrderStatus it implies. Terminal steps (Delivered,
 * Returned) end the journey; only "Picked By PostEx" marks the order SHIPPED.
 *
 * Unrecognized / empty statuses stay at LABEL_CREATED — never invent IN_TRANSIT.
 */
export function mapPostExStatus(raw: string): {
  shipment: ShipmentStatus;
  order?: OrderStatus;
  terminal: boolean;
} {
  const s = raw.toLowerCase().trim();

  // Still at the merchant — label printed, rider has not collected yet.
  if (isPostExPrePickupStatus(raw))
    return { shipment: ShipmentStatus.LABEL_CREATED, terminal: false };

  if (s.includes('expired') || s.includes('un-assigned'))
    return { shipment: ShipmentStatus.FAILED, terminal: true };

  if (s.includes('return'))
    return { shipment: ShipmentStatus.RETURNED, order: OrderStatus.RETURNED, terminal: true };

  if (s.includes('out for delivery'))
    return { shipment: ShipmentStatus.OUT_FOR_DELIVERY, terminal: false };

  if (s.includes('deliver'))
    return { shipment: ShipmentStatus.DELIVERED, order: OrderStatus.DELIVERED, terminal: true };

  if (isPostExPickedUpStatus(raw))
    return {
      shipment: ShipmentStatus.IN_TRANSIT,
      order: OrderStatus.SHIPPED,
      terminal: false,
    };

  if (isPostExPostPickupStatus(raw))
    return { shipment: ShipmentStatus.IN_TRANSIT, terminal: false };

  // Ambiguous payload — keep the booking as label-created; do not invent transit.
  return { shipment: ShipmentStatus.LABEL_CREATED, terminal: false };
}
