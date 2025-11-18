// db.js
import mongoose from "mongoose";
import * as lancedb from "@lancedb/lancedb";

let mongoReady = false;
let lanceConn = null;

export const connectMongo = async () => {
  if (mongoReady) return mongoose.connection;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("Missing MONGO_URI in environment");
    process.exit(1);
  }

  // IMPORTANT: do NOT pass dbName; let the name from URI (ragDB) be used
  await mongoose.connect(uri);

  if (mongoose.connection.readyState !== 1) {
    console.error("MongoDB not in readyState=1 after connect");
    process.exit(1);
  }

  mongoReady = true;
  console.log("MongoDB connected to", mongoose.connection.name); // should log "ragDB"
  return mongoose.connection;
};

export const connectLance = async () => {
  if (lanceConn) return lanceConn;
  const path = process.env.LANCEDB_DIR || "./lancedb";
  const db = await lancedb.connect(path);
  await db.tableNames();
  lanceConn = db;
  console.log("LanceDB connected at", path);
  return lanceConn;
};
