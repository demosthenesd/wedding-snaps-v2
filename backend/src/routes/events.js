import express from "express";
import multer from "multer";
import {
  createEvent,
  deleteUpload,
  getEventConfig,
  listMyUploads,
  listUploads,
  streamFile,
  updateComment,
  updateUploaderName,
  uploadFile,
} from "../controllers/eventsController.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.post("/", createEvent);
router.get("/:eventId", getEventConfig);
router.get("/:eventId/uploads", listUploads);
router.get("/:eventId/my-uploads", listMyUploads);
router.get("/:eventId/files/:fileId", streamFile);
router.post("/:eventId/upload", upload.single("file"), uploadFile);
router.delete("/:eventId/uploads/:uploadId", deleteUpload);
router.patch("/:eventId/uploads/:uploadId/comment", updateComment);
router.patch("/:eventId/uploader-name", updateUploaderName);

export default router;
