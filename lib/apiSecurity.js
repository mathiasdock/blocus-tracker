import crypto from "crypto";

export function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd[0]) return String(fwd[0]).split(",")[0].trim();
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.length > 0) return realIp;
  return req.socket?.remoteAddress || "unknown";
}

export function setBaseSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-store");
}

export function timingSafeEqualText(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (Array.isArray(header)) return "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || "";
}

export function requireJson(req, res) {
  const type = String(req.headers["content-type"] || "").toLowerCase();
  if (!type.includes("application/json")) {
    res.status(415).json({ error: "Unsupported media type" });
    return false;
  }
  return true;
}
