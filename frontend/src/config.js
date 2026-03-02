export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.DEV
    ? "http://localhost:8080"
    : "https://candidsnaps.onrender.com");
