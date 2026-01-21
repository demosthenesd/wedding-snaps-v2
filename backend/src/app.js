import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import eventsRoutes from "./routes/events.js";
import oauthRoutes from "./routes/oauth.js";
import { healthCheck } from "./controllers/eventsController.js";
import { CORS_ORIGINS } from "./config.js";

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (CORS_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
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
