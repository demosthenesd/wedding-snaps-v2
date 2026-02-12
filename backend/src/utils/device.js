import crypto from "crypto";

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

export function getDeviceHash(req) {
  const deviceId = req.get("X-Device-Id") || "";
  return sha256(deviceId || req.ip || "unknown");
}
