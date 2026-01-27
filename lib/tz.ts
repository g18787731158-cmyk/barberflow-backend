import { DateTime } from "luxon";

export const BIZ_TZ = "Asia/Shanghai";

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function hasExplicitOffset(s: string) {
  return /[zZ]$|[+\-]\d{2}:\d{2}$/.test(s);
}

function toBizDateTime(input?: string | number | Date) {
  if (input instanceof Date) {
    return DateTime.fromJSDate(input, { zone: "utc" }).setZone(BIZ_TZ);
  }
  if (typeof input === "number" && Number.isFinite(input)) {
    return DateTime.fromMillis(input, { zone: "utc" }).setZone(BIZ_TZ);
  }
  if (isString(input)) {
    const s = input.trim();
    if (!s) return DateTime.invalid("invalid");
    if (hasExplicitOffset(s)) {
      return DateTime.fromISO(s, { setZone: true }).setZone(BIZ_TZ);
    }
    const normalized = s.includes("T") ? s : s.replace(" ", "T");
    return DateTime.fromISO(normalized, { zone: BIZ_TZ });
  }
  return DateTime.now().setZone(BIZ_TZ);
}

export function parseClientTimeToUtcDate(input: unknown): Date | null {
  if (input instanceof Date) {
    return DateTime.fromJSDate(input).toUTC().toJSDate();
  }
  if (typeof input === "number" && Number.isFinite(input)) {
    return DateTime.fromMillis(input, { zone: "utc" }).toUTC().toJSDate();
  }
  if (!isString(input)) return null;

  const raw = input.trim();
  if (!raw) return null;

  if (hasExplicitOffset(raw)) {
    const dt = DateTime.fromISO(raw, { setZone: true });
    return dt.isValid ? dt.toUTC().toJSDate() : null;
  }

  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const dt = DateTime.fromISO(normalized, { zone: BIZ_TZ });
  return dt.isValid ? dt.toUTC().toJSDate() : null;
}

export function bizDateString(input?: string | number | Date) {
  const dt = toBizDateTime(input);
  if (!dt.isValid) return "";
  return dt.toISODate() || "";
}

export function startOfBizDayUtc(input?: string | number | Date) {
  const dt = toBizDateTime(input);
  return dt.startOf("day").toUTC().toJSDate();
}

export function endOfBizDayUtc(input?: string | number | Date) {
  const dt = toBizDateTime(input);
  return dt.endOf("day").toUTC().toJSDate();
}

export function startOfBizWeekUtc(input?: string | number | Date) {
  const dt = toBizDateTime(input).startOf("day");
  const diffToMon = dt.weekday - 1;
  return dt.minus({ days: diffToMon }).toUTC().toJSDate();
}

export function endOfBizWeekUtc(input?: string | number | Date) {
  const start = DateTime.fromJSDate(startOfBizWeekUtc(input), { zone: "utc" }).setZone(BIZ_TZ);
  return start.plus({ days: 7 }).minus({ milliseconds: 1 }).toUTC().toJSDate();
}

export function startOfBizMonthUtc(input?: string | number | Date) {
  const dt = toBizDateTime(input).startOf("month").startOf("day");
  return dt.toUTC().toJSDate();
}

export function endOfBizMonthUtc(input?: string | number | Date) {
  const dt = toBizDateTime(input).endOf("month");
  return dt.toUTC().toJSDate();
}

export function utcDateToBizISO(date: Date) {
  return DateTime.fromJSDate(date, { zone: "utc" }).setZone(BIZ_TZ).toISO();
}

export function utcDateToBizHHmm(date: Date) {
  return DateTime.fromJSDate(date, { zone: "utc" }).setZone(BIZ_TZ).toFormat("HH:mm");
}

export function utcDateToBizMinutes(date: Date) {
  const dt = DateTime.fromJSDate(date, { zone: "utc" }).setZone(BIZ_TZ);
  return dt.hour * 60 + dt.minute;
}

export function addBizDays(input: string | number | Date, days: number) {
  const dt = toBizDateTime(input).startOf("day").plus({ days });
  return dt.toISODate() || "";
}
