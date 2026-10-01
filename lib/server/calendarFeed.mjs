import https from "node:https";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

export const MAX_FEED_BYTES = 2 * 1024 * 1024;
export class CalendarError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

// No URL, upstream body, DNS or HTTP error may cross the API/log boundary.
export function calendarError(error) {
  return error instanceof CalendarError ? error : new CalendarError("calendar_sync_failed", 502);
}

export function validateFeedUrl(value) {
  try {
    if (typeof value !== "string" || value.length > 4096) throw new Error();
    const url = new URL(value.replace(/^webcal:/i, "https:"));
    if (url.protocol !== "https:" || url.username || url.password || url.hash
      || (url.port && url.port !== "443")) throw new Error();
    return url;
  } catch { throw new CalendarError("invalid_calendar_url"); }
}

export function publicAddress(address) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast";
  } catch { return false; }
}

// Pin the validated DNS answer to the socket (including across DNS rebinding).
// Redirects are deliberately refused: no private token forwarded to a new host.
export async function fetchCalendarFeed(value, validators = {}, { resolve = lookup, request = https.request } = {}) {
  const url = validateFeedUrl(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await Promise.race([
      resolve(hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error()), { once: true })),
    ]);
    if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) {
      throw new CalendarError("unsafe_calendar_host");
    }
    const chosen = addresses[0];
    const headers = { Accept: "text/calendar", "Accept-Encoding": "identity", "User-Agent": "BlocusTracker-Calendar/1" };
    for (const [key, header] of [["etag", "If-None-Match"], ["last_modified", "If-Modified-Since"]]) {
      if (typeof validators[key] === "string" && validators[key].length < 1024 && !/[\r\n]/.test(validators[key])) headers[header] = validators[key];
    }
    return await new Promise((resolveResponse, reject) => {
      const req = request(url, {
        method: "GET", headers, signal: controller.signal, agent: false,
        lookup: (_host, options, callback) => options.all
          ? callback(null, [chosen]) : callback(null, chosen.address, chosen.family),
      }, (res) => {
        const fail = (code) => { res.destroy(); reject(new CalendarError(code, 502)); };
        if (res.statusCode === 304) { res.resume(); resolveResponse({ notModified: true }); return; }
        if (res.statusCode !== 200) { fail("calendar_fetch_failed"); return; }
        if (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") { fail("unsupported_calendar_encoding"); return; }
        if (Number(res.headers["content-length"]) > MAX_FEED_BYTES) { fail("calendar_too_large"); return; }
        let bytes = 0;
        const chunks = [];
        res.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_FEED_BYTES) { fail("calendar_too_large"); return; }
          chunks.push(chunk);
        });
        res.on("error", () => reject(new CalendarError("calendar_fetch_failed", 502)));
        res.on("end", () => resolveResponse({
          text: Buffer.concat(chunks).toString("utf8"),
          etag: safeValidator(res.headers.etag), last_modified: safeValidator(res.headers["last-modified"]),
        }));
      });
      req.on("error", () => reject(new CalendarError("calendar_fetch_failed", 502)));
      req.end();
    });
  } catch (error) { throw calendarError(error); }
  finally { clearTimeout(timer); }
}

function safeValidator(value) {
  return typeof value === "string" && value.length < 1024 && !/[\r\n]/.test(value) ? value : null;
}
