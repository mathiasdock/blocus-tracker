const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function exchangeLocalDate(instant = new Date(), timezone = "UTC") {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(instant);
    const get = type => parts.find(part => part.type === type)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

export function exchangeState(exchange, instant = new Date(), timezone = "UTC") {
  const host = String(exchange?.exchange_university || "").trim();
  const start = exchange?.exchange_start_date;
  const end = exchange?.exchange_end_date;
  if (!host || !DATE_PATTERN.test(start || "") || !DATE_PATTERN.test(end || "")) return "none";
  const today = exchangeLocalDate(instant, timezone);
  if (today < start) return "upcoming";
  if (today > end) return "ended";
  return "active";
}

export function validateExchange({ home, host, start, end }) {
  const cleanHost = String(host || "").trim();
  if (cleanHost.length < 2 || cleanHost.length > 180) return "host";
  if (cleanHost.toLocaleLowerCase() === String(home || "").trim().toLocaleLowerCase()) return "same";
  if (!DATE_PATTERN.test(start || "") || !DATE_PATTERN.test(end || "") ||
      !Number.isFinite(Date.parse(`${start}T00:00:00Z`)) ||
      !Number.isFinite(Date.parse(`${end}T00:00:00Z`))) return "dates";
  if (end < start) return "order";
  return null;
}
