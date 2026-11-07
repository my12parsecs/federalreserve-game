import { START_DATE } from "./config";

/** Trading day index → calendar date (weekdays only; holidays ignored). */
export function dayToDate(day: number): Date {
  const week = Math.floor(day / 5);
  const dow = ((day % 5) + 5) % 5;
  return new Date(START_DATE.getTime() + (week * 7 + dow) * 86400000);
}

/**
 * Date labels are requested many times per tick (charts, tiles, feeds), and
 * toLocaleDateString builds a new formatter on every call. So: one shared
 * Intl formatter per style, plus a per-day result cache.
 */
function cachedFormatter(opts: Intl.DateTimeFormatOptions): (day: number) => string {
  const fmt = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" });
  const cache = new Map<number, string>();
  return (day: number) => {
    const d = Math.round(day);
    let s = cache.get(d);
    if (s === undefined) {
      s = fmt.format(dayToDate(d));
      if (cache.size > 5000) cache.clear();
      cache.set(d, s);
    }
    return s;
  };
}

export const formatMonth = cachedFormatter({ month: "short", year: "numeric" });
export const formatDay = cachedFormatter({ weekday: "short", month: "short", day: "numeric", year: "numeric" });
export const formatShortDay = cachedFormatter({ month: "short", day: "numeric" });

const HOURS = 7; // keep in sync with HOURS_PER_DAY (economy.ts)

/** Clock label for the current trading hour (0 = market closed). */
export function formatClock(hour: number): string {
  if (hour <= 0 || hour >= HOURS) return "4:00 PM · Closed";
  const h = 9 + hour; // 10:00 … 15:00
  return `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "PM" : "AM"}`;
}

/**
 * Label for a (possibly fractional) chart point. Day d's hourly ticks run
 * d−1+1/7 … d, where the integer point d is that day's 4:00 PM close.
 */
export function formatPoint(t: number): string {
  const base = Math.ceil(t - 1e-6);
  const hour = Math.round((t - (base - 1)) * HOURS);
  return `${formatDay(base)} · ${hour >= HOURS ? "4:00 PM" : formatClock(hour)}`;
}
