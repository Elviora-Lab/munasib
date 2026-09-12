export const STORE_TIME_ZONE = 'Asia/Karachi';

const DAY_MS = 86_400_000;

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

function zonedParts(date: Date, timeZone = STORE_TIME_ZONE): ZonedParts {
  const parts = zonedFormatter(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function timeZoneOffsetMs(date: Date, timeZone = STORE_TIME_ZONE): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(parts: ZonedParts, timeZone = STORE_TIME_ZONE): Date {
  const wallTimeAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const firstPass = new Date(wallTimeAsUtc - timeZoneOffsetMs(new Date(wallTimeAsUtc), timeZone));
  return new Date(wallTimeAsUtc - timeZoneOffsetMs(firstPass, timeZone));
}

function storeCalendarDate(now: Date): Date {
  const parts = zonedParts(now);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function startOfStoreDay(now = new Date()): Date {
  const parts = zonedParts(now);
  return zonedDateTimeToUtc({ ...parts, hour: 0, minute: 0, second: 0 });
}

export function startOfStoreWeek(now = new Date()): Date {
  const today = storeCalendarDate(now);
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  const monday = new Date(today.getTime() - mondayOffset * DAY_MS);

  return zonedDateTimeToUtc({
    year: monday.getUTCFullYear(),
    month: monday.getUTCMonth() + 1,
    day: monday.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
  });
}

export function storeYear(now = new Date()): number {
  return zonedParts(now).year;
}

export function formatStoreDateTimeLocalInput(value: string | number | Date): string {
  const parts = zonedParts(new Date(value));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(
    parts.minute,
  )}`;
}

const STORE_LOCAL_INPUT_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?)?$/;

/**
 * HTML datetime-local values do not include an offset. Treat them as Pakistan
 * store time instead of letting the server timezone decide the saved instant.
 */
export function parseStoreDateTimeInput(value: string): Date {
  const match = STORE_LOCAL_INPUT_RE.exec(value.trim());
  if (!match) return new Date(value);

  return zonedDateTimeToUtc({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
    second: Number(match[6] ?? 0),
  });
}

/** Calendar date in store TZ as YYYY-MM-DD. */
export function formatStoreDateKey(now = new Date()): string {
  const parts = zonedParts(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/**
 * Inclusive `from`/`to` calendar days (YYYY-MM-DD, Asia/Karachi) → Prisma
 * `createdAt` bounds. `to` is exclusive end-of-day via next midnight.
 */
export function storeDateRangeFilter(
  from?: string,
  to?: string,
): { gte?: Date; lt?: Date } | undefined {
  const dayRe = /^\d{4}-\d{2}-\d{2}$/;
  const gte = from && dayRe.test(from) ? parseStoreDateTimeInput(`${from}T00:00:00`) : undefined;
  const lt =
    to && dayRe.test(to)
      ? new Date(parseStoreDateTimeInput(`${to}T00:00:00`).getTime() + DAY_MS)
      : undefined;
  if (!gte && !lt) return undefined;
  return { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) };
}
