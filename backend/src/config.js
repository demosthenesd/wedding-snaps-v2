const DEFAULT_PUBLIC_BASE_URL =
  "https://devserver-dev--candidsnaps.netlify.app";
const DEFAULT_PROD_BASE_URL = "https://candidsnaps.netlify.app";

export const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL;

const envCorsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const CORS_ORIGINS = [
  ...new Set([
    PUBLIC_BASE_URL,
    DEFAULT_PUBLIC_BASE_URL,
    DEFAULT_PROD_BASE_URL,
    ...envCorsOrigins,
  ]),
];

export const API_PUBLIC_BASE_URL =
  process.env.API_PUBLIC_BASE_URL || "https://candidsnaps.onrender.com";
