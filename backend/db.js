import mongoose from "mongoose";
import fs from "fs";

let mongoReady = false;

// MongoDB Connection
export const connectMongo = async () => {
  if (mongoReady) return mongoose.connection;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ Missing MONGO_URI in environment");
    process.exit(1);
  }

  await mongoose.connect(uri);

  if (mongoose.connection.readyState !== 1) {
    console.error("❌ MongoDB not in readyState=1 after connect");
    process.exit(1);
  }

  mongoReady = true;
  console.log("MongoDB connected to", mongoose.connection.name);
  return mongoose.connection;
};
