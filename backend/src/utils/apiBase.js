export function apiBaseFromReq(req) {
  const envBase = process.env.API_PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}
