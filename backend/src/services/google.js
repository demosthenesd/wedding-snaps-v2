import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { requireEnv } from "../utils/env.js";

const oauth2Client = new google.auth.OAuth2(
  requireEnv("GOOGLE_OAUTH_CLIENT_ID"),
  requireEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
  requireEnv("GOOGLE_OAUTH_REDIRECT_URI")
);

let serviceAccountCredentials = null;
if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  try {
    serviceAccountCredentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch (err) {
    console.warn("Invalid GOOGLE_SERVICE_ACCOUNT_JSON:", err?.message || err);
  }
} else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH) {
  try {
    const filePath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH);
    const raw = fs.readFileSync(filePath, "utf8");
    serviceAccountCredentials = JSON.parse(raw);
  } catch (err) {
    console.warn("Invalid GOOGLE_SERVICE_ACCOUNT_JSON_PATH:", err?.message || err);
  }
}

export const hasServiceAccount = !!serviceAccountCredentials;

export function getOauthClient() {
  return oauth2Client;
}

export function driveForServiceAccount() {
  if (!serviceAccountCredentials) {
    throw new Error("Service account credentials not configured");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountCredentials,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

  return google.drive({ version: "v3", auth });
}

export function driveForRefreshToken(refreshToken) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth });
}
