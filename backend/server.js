import "dotenv/config";
import app from "./src/app.js";
import { connectDb } from "./src/db.js";
import { requireEnv } from "./src/utils/env.js";

requireEnv("MONGODB_URI");
requireEnv("GOOGLE_OAUTH_CLIENT_ID");
requireEnv("GOOGLE_OAUTH_CLIENT_SECRET");
requireEnv("GOOGLE_OAUTH_REDIRECT_URI");

await connectDb();

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log("API on", port));
