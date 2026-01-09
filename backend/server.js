import express from "express";
import cors from "cors";
import multer from "multer";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import crypto from "crypto";
import { google } from "googleapis";
import { Readable } from "stream";
import "dotenv/config";

const app = express();

/** ✅ TEST folder for now (used when creating events if driveFolderId not provided) */
const TEST_DRIVE_FOLDER_ID = "1b9PoSR_UxREh5QuCOwR2i7hm3V5Y0XMt";

app.use(
  cors({
    origin: process.env.PUBLIC_BASE_URL || true,
    credentials: false,
  })
);
app.use(express.json());

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
  })
);

/** ---------- Mongo ---------- */
if (!process.env.MONGODB_URI) throw new Error("Missing MONGODB_URI in environment");
await mongoose.connect(process.env.MONGODB_URI);

/** ---------- Schemas ---------- */
const EventSchema = new mongoose.Schema({
  name: { type: String, default: "Wedding" },

  // Where uploads go (Google Drive folder)
  driveFolderId: { type: String, required: true },

  // Per-device window limit
  uploadLimit: { type: Number, default: 4 },
  windowHours: { type: Number, default: 24 },

  // Google OAuth tokens for the Drive owner (stored per event)
  googleRefreshToken: { type: String, default: "" },

  createdAt: { type: Date, default: Date.now },
});

const UploadSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  deviceHash: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  driveFileId: { type: String, index: true },
});

const Event = mongoose.model("Event", EventSchema);
const Upload = mongoose.model("Upload", UploadSchema);

/** ---------- Google OAuth ---------- */
if (!process.env.GOOGLE_OAUTH_CLIENT_ID) throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID");
if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET) throw new Error("Missing GOOGLE_OAUTH_CLIENT_SECRET");
if (!process.env.GOOGLE_OAUTH_REDIRECT_URI) throw new Error("Missing GOOGLE_OAUTH_REDIRECT_URI");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  process.env.GOOGLE_OAUTH_REDIRECT_URI
);

function driveForRefreshToken(refreshToken) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth });
}

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
  limits: { fileSize: 2 * 1024 * 1024 },
});

function apiBaseFromReq(req) {
  // Lets images load even if PUBLIC_BASE_URL not set
  const envBase = process.env.API_PUBLIC_BASE_URL; // optional: set e.g. https://api.yourdomain.com
  if (envBase) return envBase.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

  /** ---------- Routes ---------- */

  app.get("/", (_req, res) => res.json({ ok: true, status: "alive" }));

  /**
   * Create event
   * - If driveFolderId missing, uses TEST_DRIVE_FOLDER_ID
   */
  app.post("/events", async (req, res) => {
    const { name, driveFolderId } = req.body || {};

    const ev = await Event.create({
      name: name || "Wedding",
      driveFolderId: driveFolderId || TEST_DRIVE_FOLDER_ID,
    });

    res.json({
      ok: true,
      eventId: ev._id.toString(),
      publicUrl: `${process.env.PUBLIC_BASE_URL || ""}/?e=${ev._id.toString()}`,
      connectUrl: `${apiBaseFromReq(req)}/auth/google/start?eventId=${ev._id.toString()}`,
      driveFolderId: ev.driveFolderId, // helpful while testing
    });
  });

  /** Start OAuth for an event */
  app.get("/auth/google/start", async (req, res) => {
    const { eventId } = req.query;
    if (!eventId) return res.status(400).send("Missing eventId");

    const ev = await Event.findById(eventId);
    if (!ev) return res.status(404).send("Event not found");

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline", // important for refresh_token
      prompt: "consent", // ensures refresh_token is returned
      scope: ["https://www.googleapis.com/auth/drive.file"],
      state: ev._id.toString(), // carry eventId through callback
    });

    res.redirect(url);
  });

  /** OAuth callback (MAKE SURE GOOGLE_OAUTH_REDIRECT_URI points here) */
  app.get("/oauth2/callback", async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send("Missing code/state");

    const eventId = String(state);
    const ev = await Event.findById(eventId);
    if (!ev) return res.status(404).send("Event not found");

    const { tokens } = await oauth2Client.getToken(String(code));

    if (!tokens.refresh_token) {
      return res
        .status(400)
        .send(
          "No refresh_token returned. Remove app access from your Google Account and try again (or ensure prompt=consent)."
        );
    }

    ev.googleRefreshToken = tokens.refresh_token;
    await ev.save();

    const back = `${process.env.PUBLIC_BASE_URL || "http://localhost:5173"}/?e=${ev._id.toString()}`;
    res.redirect(back);
  });

  /** Public event config (frontend uses this) */
  app.get("/events/:eventId", async (req, res) => {
    const ev = await Event.findById(req.params.eventId);
    if (!ev) return res.status(404).json({ ok: false, error: "Event not found" });

    res.json({
      ok: true,
      name: ev.name,
      uploadLimit: ev.uploadLimit,
      windowHours: ev.windowHours,
      isDriveConnected: !!ev.googleRefreshToken,
    });
  });

  /**
   * ✅ List uploads for event (for grid)
   * Returns URLs that the frontend can put directly into <img src="...">
   */
  app.get("/events/:eventId/uploads", async (req, res) => {
    const ev = await Event.findById(req.params.eventId);
    if (!ev) return res.status(404).json({ ok: false, error: "Event not found" });

    // Allow listing even if not connected; it will just be empty or unusable
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 80)));

    const uploads = await Upload.find({ eventId: ev._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const base = apiBaseFromReq(req);

    res.json({
      ok: true,
      items: uploads
        .filter((u) => !!u.driveFileId)
        .map((u) => ({
          id: String(u._id),
          driveFileId: u.driveFileId,
          createdAt: u.createdAt,
          // stream endpoint (below)
          url: `${base}/events/${ev._id.toString()}/files/${u.driveFileId}`,
        })),
    });
  });

  /**
   * ✅ Stream a Drive file as an image (used by the grid)
   * Security: only streams if that driveFileId exists in Uploads for this event.
   */
  app.get("/events/:eventId/files/:fileId", async (req, res) => {
    const ev = await Event.findById(req.params.eventId);
    if (!ev) return res.status(404).send("Event not found");

    if (!ev.googleRefreshToken) return res.status(400).send("Drive not connected for this event");

    const fileId = String(req.params.fileId || "");
    if (!fileId) return res.status(400).send("Missing fileId");

    const exists = await Upload.exists({ eventId: ev._id, driveFileId: fileId });
    if (!exists) return res.status(404).send("File not found for this event");

    try {
      const drive = driveForRefreshToken(ev.googleRefreshToken);

      // Stream bytes
      const r = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "stream" }
      );

      // Best effort content-type
      const ct = r?.headers?.["content-type"] || "image/jpeg";
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=300"); // small cache

      r.data.on("error", (err) => {
        console.error("Drive stream error:", err);
        if (!res.headersSent) res.status(500).end("Stream error");
        else res.end();
      });

      r.data.pipe(res);
    } catch (err) {
      console.error("Drive fetch error:", err?.message || err);
      res.status(500).send("Failed to fetch file");
    }
  });

  /** Upload endpoint (uploads AS the Drive owner via refresh token) */
  app.post("/events/:eventId/upload", upload.single("file"), async (req, res) => {
    const ev = await Event.findById(req.params.eventId);
    if (!ev) return res.status(404).json({ ok: false, error: "Event not found" });

    if (!ev.googleRefreshToken) {
      return res.status(400).json({
        ok: false,
        error: "Drive not connected for this event yet. Owner must connect Google Drive first.",
        connectUrl: `${apiBaseFromReq(req)}/auth/google/start?eventId=${ev._id.toString()}`,
      });
    }

    const file = req.file;
    if (!file) return res.status(400).json({ ok: false, error: "Missing file" });
    if (!file.mimetype?.startsWith("image/")) {
      return res.status(400).json({ ok: false, error: "Only images allowed" });
    }

    const deviceHash = getDeviceHash(req);

    const since = new Date(Date.now() - ev.windowHours * 60 * 60 * 1000);
    const recentCount = await Upload.countDocuments({
      eventId: ev._id,
      deviceHash,
      createdAt: { $gte: since },
    });

    if (recentCount >= ev.uploadLimit) {
      return res.status(429).json({ ok: false, error: "Upload limit reached for this device (windowed)" });
    }

    const drive = driveForRefreshToken(ev.googleRefreshToken);
    const stream = Readable.from(file.buffer);

    const driveResp = await drive.files.create({
      requestBody: {
        name: `wedding-snap-${Date.now()}.jpg`,
        parents: [ev.driveFolderId],
      },
      media: { mimeType: file.mimetype, body: stream },
      fields: "id",
    });

    const driveFileId = driveResp?.data?.id;

    const uploadDoc = await Upload.create({ eventId: ev._id, deviceHash, driveFileId });

    res.json({
      ok: true,
      driveFileId,
      uploadId: uploadDoc._id.toString(),
      // give frontend a ready-to-use URL
      url: `${apiBaseFromReq(req)}/events/${ev._id.toString()}/files/${driveFileId}`,
    });
  });


  /**
 * ❌ Delete an upload (owner device only)
 */
app.delete("/events/:eventId/uploads/:uploadId", async (req, res) => {
  const { eventId, uploadId } = req.params;

  const ev = await Event.findById(eventId);
  if (!ev) {
    return res.status(404).json({ ok: false, error: "Event not found" });
  }

  if (!ev.googleRefreshToken) {
    return res.status(400).json({
      ok: false,
      error: "Drive not connected for this event",
    });
  }

  const upload = await Upload.findById(uploadId);
  if (!upload) {
    return res.status(404).json({ ok: false, error: "Upload not found" });
  }

  if (String(upload.eventId) !== String(ev._id)) {
    return res.status(403).json({ ok: false, error: "Upload does not belong to this event" });
  }

  // Enforce device ownership
  const deviceHash = getDeviceHash(req);
  if (upload.deviceHash !== deviceHash) {
    return res.status(403).json({
      ok: false,
      error: "You can only delete photos uploaded from this device",
    });
  }

  try {
    const drive = driveForRefreshToken(ev.googleRefreshToken);

    // Best-effort Drive delete (file may already be gone)
    if (upload.driveFileId) {
      try {
        await drive.files.delete({ fileId: upload.driveFileId });
      } catch (err) {
        console.warn("Drive delete failed (continuing):", err?.message || err);
      }
    }

    await upload.deleteOne();

    res.json({ ok: true });
  } catch (err) {
    console.error("Delete upload failed:", err);
    res.status(500).json({ ok: false, error: "Failed to delete upload" });
  }
});

/**
 * ✅ List uploads for THIS device only (Personal Grid)
 */
app.get("/events/:eventId/my-uploads", async (req, res) => {
  const ev = await Event.findById(req.params.eventId);
  if (!ev) return res.status(404).json({ ok: false, error: "Event not found" });

  const deviceHash = getDeviceHash(req);

  const uploads = await Upload.find({
    eventId: ev._id,
    deviceHash,
  })
    .sort({ createdAt: -1 })
    .lean();

  const base = apiBaseFromReq(req);

  res.json({
    ok: true,
    items: uploads
      .filter((u) => !!u.driveFileId)
      .map((u) => ({
        id: String(u._id),
        driveFileId: u.driveFileId,
        createdAt: u.createdAt,
        url: `${base}/events/${ev._id.toString()}/files/${u.driveFileId}`,
      })),
  });
});

  /** ---------- Boot ---------- */
  const port = Number(process.env.PORT || 8080);
  app.listen(port, () => console.log("API on", port));
