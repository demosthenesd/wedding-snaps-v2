import mongoose from "mongoose";

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

export const Event = mongoose.model("Event", EventSchema);
