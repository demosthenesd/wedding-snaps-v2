import express from "express";
import cors from "cors";
import multer from "multer";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import crypto from "crypto";
import { google } from "googleapis";
import fs from "fs";
import { Readable } from "stream";
import "dotenv/config";

const app = express();

app.use(
  cors({
    origin: process.env.PUBLIC_BASE_URL || true,
    credentials: false,
  })
);
app.use(express.json());

/** Basic API rate limit (public internet safety) */
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
  })
);

/** ---------- Mongo ---------- */
if (!process.env.MONGODB_URI) {
  throw new Error("Missing MONGODB_URI in environment");
}
await mongoose.connect(process.env.MONGODB_URI);

/** ---------- Schemas ---------- */
const EventSchema = new mongoose.Schema({
  name: { type: String, default: "Wedding" },
  driveFolderId: { type: String, required: true },
  uploadLimit: { type: Number, default: 4 },
  windowHours: { type: Number, default: 24 },
  createdAt: { type: Date, default: Date.now },
});

const UploadSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  deviceHash: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  driveFileId: { type: String },
});

const Event = mongoose.model("Event", EventSchema);
const Upload = mongoose.model("Upload", UploadSchema);

/** ---------- Google Drive (Service Account) ---------- */
function loadServiceAccountCredentials() {
  // Preferred: read from file path
  const p = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (p && fs.existsSync(p)) {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  }

  // Optional fallback: JSON string in env
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (json) return JSON.parse(json);

  throw new Error(
    "Missing Google credentials. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH to your service account JSON file path (recommended)."
  );
}

const credentials = loadServiceAccountCredentials();

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

/** ---------- Helpers ---------- */
function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function getDeviceHash(req) {
  const deviceId = req.get("X-Device-Id") || "";
  return sha256(deviceId || req.ip || "unknown");
}

/** Multer in-memory upload */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB hard limit
});

/** ---------- Routes ---------- */

app.get("/", async (_req, res) => {
  res.json({ kamusta:true });
});

/** Admin create event (protect later with a secret) */
app.post("/events", async (req, res) => {
  const { name, driveFolderId } = req.body || {};
  if (!driveFolderId) {
    return res.status(400).json({ ok: false, error: "driveFolderId required" });
  }

  const ev = await Event.create({ name, driveFolderId });

  res.json({
    ok: true,
    eventId: ev._id.toString(),
    publicUrl: `${process.env.PUBLIC_BASE_URL || ""}/?e=${ev._id.toString()}`,
  });
});

/** Public event config */
app.get("/events/:eventId", async (req, res) => {
  const ev = await Event.findById(req.params.eventId);
  if (!ev) return res.status(404).json({ ok: false, error: "Event not found" });

  res.json({
    ok: true,
    name: ev.name,
    uploadLimit: ev.uploadLimit,
    windowHours: ev.windowHours,
  });
});

/** Upload */
app.post("/events/:eventId/upload", upload.single("file"), async (req, res) => {
  const ev = await Event.findById(req.params.eventId);
  if (!ev) return res.status(404).json({ ok: false, error: "Event not found" });

  const file = req.file;
  if (!file) return res.status(400).json({ ok: false, error: "Missing file" });
  if (!file.mimetype?.startsWith("image/")) {
    return res.status(400).json({ ok: false, error: "Only images allowed" });
  }

  const deviceHash = getDeviceHash(req);

  // Enforce "N per windowHours" per device
  const since = new Date(Date.now() - ev.windowHours * 60 * 60 * 1000);
  const recentCount = await Upload.countDocuments({
    eventId: ev._id,
    deviceHash,
    createdAt: { $gte: since },
  });

  if (recentCount >= ev.uploadLimit) {
    return res.status(429).json({
      ok: false,
      error: "Upload limit reached for this device (windowed)",
    });
  }

  // Upload to Drive folder
  const stream = Readable.from(file.buffer);

  const driveResp = await drive.files.create({
    requestBody: {
      name: `wedding-snap-${Date.now()}.jpg`,
      parents: [ev.driveFolderId],
    },
    media: {
      mimeType: file.mimetype,
      body: stream,
    },
    fields: "id",
  });

  const driveFileId = driveResp?.data?.id;

  await Upload.create({
    eventId: ev._id,
    deviceHash,
    driveFileId,
  });

  res.json({ ok: true, driveFileId });
});

/** ---------- Boot ---------- */
const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log("API on", port));
