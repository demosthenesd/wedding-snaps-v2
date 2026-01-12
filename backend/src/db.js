import mongoose from "mongoose";

export async function connectDb() {
  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI in environment");
  }
  await mongoose.connect(process.env.MONGODB_URI);
}
