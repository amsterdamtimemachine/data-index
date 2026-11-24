/**
 * Dates at the precision a source recorded them: a year, a month or a day, written
 * "1907", "1907-05" or "1907-05-12". A source's "xx" stands for a part it does not
 * know ("1907-05-xx"). Periods are inclusive, as YYYY-MM-DD.
 */

export type PartialDate = { year: number; month?: number; day?: number };

const PARTIAL_DATE = /^(\d{4})(?:-(\d{2}|xx)(?:-(\d{2}|xx))?)?$/;

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The date a source wrote, or null when it is not one or cannot exist. */
export function parsePartialDate(raw: string): PartialDate | null {
  const match = raw.match(PARTIAL_DATE);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = parseInt(y, 10);
  if (!m || m === 'xx') {
    if (d && d !== 'xx') return null;
    return { year };
  }
  const month = parseInt(m, 10);
  if (month < 1 || month > 12) return null;
  if (!d || d === 'xx') return { year, month };
  const day = parseInt(d, 10);
  if (day < 1 || day > lastDayOfMonth(year, month)) return null;
  return { year, month, day };
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** "1907", "1907-05" or "1907-05-12". */
export function formatIsoDate(date: PartialDate): string {
  let iso = pad(date.year, 4);
  if (date.month) iso += `-${pad(date.month, 2)}`;
  if (date.day) iso += `-${pad(date.day, 2)}`;
  return iso;
}

/** The inclusive period a date covers: the day, the whole month or the whole year. */
export function partialDateRange(date: PartialDate): { startDate: string; endDate: string } {
  const { year, month, day } = date;
  if (month && day) {
    const iso = formatIsoDate(date);
    return { startDate: iso, endDate: iso };
  }
  if (month) {
    return { startDate: formatIsoDate({ year, month, day: 1 }), endDate: formatIsoDate({ year, month, day: lastDayOfMonth(year, month) }) };
  }
  return { startDate: formatIsoDate({ year, month: 1, day: 1 }), endDate: formatIsoDate({ year, month: 12, day: 31 }) };
}

/** The date an inclusive period reads as when it is one day, a whole month or a whole year; else null. */
export function periodAsPartialDate(startDate: string, endDate: string): PartialDate | null {
  const start = parsePartialDate(startDate);
  const end = parsePartialDate(endDate);
  if (!start?.day || !end?.day) return null;
  if (startDate === endDate) return start;
  if (start.year !== end.year || start.day !== 1) return null;
  if (start.month === 1 && end.month === 12 && end.day === 31) return { year: start.year };
  if (start.month === end.month && end.day === lastDayOfMonth(end.year, end.month!)) return { year: start.year, month: start.month };
  return null;
}

// a Postgres daterange literal: "[1900-01-01,1900-12-31)"; a ")" end is exclusive
const DATE_RANGE = /^\s*([\[(])\s*(\d{4}-\d{2}-\d{2})\s*,\s*(\d{4}-\d{2}-\d{2})\s*([)\]])\s*$/;

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The inclusive period a daterange literal covers: an exclusive end becomes the day
 * before. Null when it is not a range, or empty, such as "[d,d)".
 */
export function parseDateRange(raw: string): { startDate: string; endDate: string } | null {
  const match = raw.match(DATE_RANGE);
  if (!match) return null;
  const [, , start, end, closer] = match;
  if (!parsePartialDate(start)?.day || !parsePartialDate(end)?.day) return null;
  let endDate = end;
  if (closer === ')') endDate = dayBefore(end);
  if (endDate < start) return null;
  return { startDate: start, endDate };
}
