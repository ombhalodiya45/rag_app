// db.js
import mongoose from "mongoose";
import * as lancedb from "@lancedb/lancedb";
import fs from "fs";

let mongoReady = false;
let lanceConn = null;

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

export const connectLance = async () => {
  if (lanceConn) return lanceConn;

  const path = process.env.LANCEDB_DIR || "./lancedb";

  // ✅ Ensure directory exists
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, { recursive: true });
    console.log("Created LanceDB directory:", path);
  }

  const db = await lancedb.connect(path);
  await db.tableNames(); // triggers initialization

  lanceConn = db;

  console.log("LanceDB connected at", path);
  return lanceConn;
};
