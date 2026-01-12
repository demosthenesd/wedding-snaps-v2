export function apiBaseFromReq(req) {
  // Lets images load even if API_PUBLIC_BASE_URL not set
  const envBase = process.env.API_PUBLIC_BASE_URL; // optional: set e.g. https://api.yourdomain.com
  if (envBase) return envBase.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}
