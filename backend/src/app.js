import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import eventsRoutes from "./routes/events.js";
import oauthRoutes from "./routes/oauth.js";
import { healthCheck } from "./controllers/eventsController.js";

const PUBLIC_BASE_URL = "https://candidsnaps.netlify.app";

const app = express();

app.use(
  cors({
    origin: PUBLIC_BASE_URL,
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

app.get("/", healthCheck);
app.use("/", oauthRoutes);
app.use("/events", eventsRoutes);

export default app;
