import { Readable } from "stream";
import { Event } from "../models/Event.js";
import { Upload } from "../models/Upload.js";
import {
  driveForRefreshToken,
  driveForServiceAccount,
  hasServiceAccount,
} from "../services/google.js";
import { apiBaseFromReq } from "../utils/apiBase.js";
import { getDeviceHash } from "../utils/device.js";

const TEST_DRIVE_FOLDER_ID = "1b9PoSR_UxREh5QuCOwR2i7hm3V5Y0XMt";

function formatUpload(upload, base, eventId) {
  return {
    id: String(upload._id),
    driveFileId: upload.driveFileId,
    createdAt: upload.createdAt,
    updatedAt: upload.updatedAt,
    uploaderName: upload.uploaderName,
    comment: upload.comment,
    url: `${base}/events/${eventId}/files/${upload.driveFileId}`,
  };
}

export function healthCheck(_req, res) {
  res.json({ ok: true, status: "alive" });
}

export async function createEvent(req, res) {
  const { name, driveFolderId } = req.body || {};

  const ev = await Event.create({
    name: name || "Wedding",
    driveFolderId: driveFolderId || TEST_DRIVE_FOLDER_ID,
  });

  res.json({
    ok: true,
    eventId: ev._id.toString(),
    publicUrl: `${process.env.PUBLIC_BASE_URL || ""}/?e=${ev._id.toString()}`,
    connectUrl: `https://candidsnaps.onrender.com/auth/google/start?eventId=${ev._id.toString()}`,
    driveFolderId: ev.driveFolderId, // helpful while testing
  });
}

export async function getEventConfig(req, res) {
  const ev = await Event.findById(req.params.eventId);
  if (!ev) return res.status(404).json({ ok: false, error: "Event not found" });

  res.json({
    ok: true,
    name: ev.name,
    uploadLimit: ev.uploadLimit,
    windowHours: ev.windowHours,
    isDriveConnected: !!ev.googleRefreshToken || hasServiceAccount,
    isServiceAccountActive: hasServiceAccount,
    isOwnerConnected: !!ev.googleRefreshToken,
  });
}

export async function listUploads(req, res) {
  const ev = await Event.findById(req.params.eventId);
  if (!ev) return res.status(404).json({ ok: false, error: "Event not found" });

  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 80)));

  const uploads = await Upload.find({
    eventId: ev._id,
    driveFileId: { $exists: true, $ne: "" },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("driveFileId createdAt updatedAt uploaderName comment")
    .lean();

  const base = apiBaseFromReq(req);

  res.json({
    ok: true,
    items: uploads.map((u) => formatUpload(u, base, ev._id.toString())),
  });
}

export async function streamFile(req, res) {
  const ev = await Event.findById(req.params.eventId);
  if (!ev) return res.status(404).send("Event not found");

  if (!ev.googleRefreshToken && !hasServiceAccount) {
    return res.status(400).send("Drive not connected for this event");
  }

  const fileId = String(req.params.fileId || "");
  if (!fileId) return res.status(400).send("Missing fileId");

  const exists = await Upload.exists({ eventId: ev._id, driveFileId: fileId });
  if (!exists) return res.status(404).send("File not found for this event");

  try {
    const drive = ev.googleRefreshToken
      ? driveForRefreshToken(ev.googleRefreshToken)
      : driveForServiceAccount();

    const r = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );

    const ct = r?.headers?.["content-type"] || "image/jpeg";
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=300");

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
}

export async function uploadFile(req, res) {
  const ev = await Event.findById(req.params.eventId);
  if (!ev) return res.status(404).json({ ok: false, error: "Event not found" });

  if (!ev.googleRefreshToken && !hasServiceAccount) {
    return res.status(400).json({
      ok: false,
      error: "Drive not connected for this event yet. Owner must connect Google Drive first.",
      connectUrl: `https://candidsnaps.onrender.com/auth/google/start?eventId=${ev._id.toString()}`,
    });
  }

  const file = req.file;
  if (!file) return res.status(400).json({ ok: false, error: "Missing file" });
  if (!file.mimetype?.startsWith("image/")) {
    return res.status(400).json({ ok: false, error: "Only images allowed" });
  }

  const deviceHash = getDeviceHash(req);
  const uploaderName = String(req.get("X-Uploader-Name") || "")
    .trim()
    .slice(0, 80);
  const since = new Date(Date.now() - ev.windowHours * 60 * 60 * 1000);
  const recentCount = await Upload.countDocuments({
    eventId: ev._id,
    deviceHash,
    createdAt: { $gte: since },
  });

  if (recentCount >= ev.uploadLimit) {
    return res
      .status(429)
      .json({ ok: false, error: "Upload limit reached for this device (windowed)" });
  }

  const drive = ev.googleRefreshToken
    ? driveForRefreshToken(ev.googleRefreshToken)
    : driveForServiceAccount();
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

  const uploadDoc = await Upload.create({
    eventId: ev._id,
    deviceHash,
    driveFileId,
    uploaderName,
  });

  res.json({
    ok: true,
    driveFileId,
    uploadId: uploadDoc._id.toString(),
    url: `${apiBaseFromReq(req)}/events/${ev._id.toString()}/files/${driveFileId}`,
  });
}

export async function deleteUpload(req, res) {
  const { eventId, uploadId } = req.params;

  const ev = await Event.findById(eventId);
  if (!ev) {
    return res.status(404).json({ ok: false, error: "Event not found" });
  }

  if (!ev.googleRefreshToken && !hasServiceAccount) {
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

  const deviceHash = getDeviceHash(req);
  if (upload.deviceHash !== deviceHash) {
    return res.status(403).json({
      ok: false,
      error: "You can only delete photos uploaded from this device",
    });
  }

  try {
    const drive = ev.googleRefreshToken
      ? driveForRefreshToken(ev.googleRefreshToken)
      : driveForServiceAccount();

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
}

export async function updateComment(req, res) {
  const { eventId, uploadId } = req.params;

  const ev = await Event.findById(eventId);
  if (!ev) {
    return res.status(404).json({ ok: false, error: "Event not found" });
  }

  const upload = await Upload.findById(uploadId);
  if (!upload) {
    return res.status(404).json({ ok: false, error: "Upload not found" });
  }

  if (String(upload.eventId) !== String(ev._id)) {
    return res.status(403).json({ ok: false, error: "Upload does not belong to this event" });
  }

  const deviceHash = getDeviceHash(req);
  if (upload.deviceHash !== deviceHash) {
    return res.status(403).json({
      ok: false,
      error: "You can only edit comments from this device",
    });
  }

  const comment = String(req.body?.comment || "").trim().slice(0, 200);
  upload.comment = comment;
  upload.updatedAt = new Date();
  await upload.save();

  res.json({ ok: true, comment });
}

export async function listMyUploads(req, res) {
  const ev = await Event.findById(req.params.eventId);
  if (!ev) return res.status(404).json({ ok: false, error: "Event not found" });

  const deviceHash = getDeviceHash(req);

  const uploads = await Upload.find({
    eventId: ev._id,
    deviceHash,
    driveFileId: { $exists: true, $ne: "" },
  })
    .sort({ createdAt: 1 })
    .select("driveFileId createdAt updatedAt uploaderName comment")
    .lean();

  const base = apiBaseFromReq(req);

  res.json({
    ok: true,
    items: uploads.map((u) => formatUpload(u, base, ev._id.toString())),
  });
}
