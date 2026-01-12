import mongoose from "mongoose";

const UploadSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  deviceHash: { type: String, required: true, index: true },
  uploaderName: { type: String, default: "" },
  comment: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now, index: true },
  driveFileId: { type: String, index: true },
});

export const Upload = mongoose.model("Upload", UploadSchema);
