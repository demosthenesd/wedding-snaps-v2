import express from "express";
import { checkAdminPasscode } from "../controllers/authController.js";

const router = express.Router();

router.post("/auth/admin-check", checkAdminPasscode);

export default router;
