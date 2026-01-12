import express from "express";
import { handleOAuthCallback, startGoogleAuth } from "../controllers/oauthController.js";

const router = express.Router();

router.get("/auth/google/start", startGoogleAuth);
router.get("/oauth2/callback", handleOAuthCallback);

export default router;
