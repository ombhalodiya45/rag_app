import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";

import { extractTextFromPDF } from "./utils/pdf.js";

import { connectMongo, connectLance } from "./db.js";
import Document from "./models/Document.js";
import { chunkText } from "./utils/chunk.js";
import { embed } from "./utils/embed.js";

dotenv.config();
const app = express();

// ---------------------- CORS -------------------------
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

// ---------------------- MULTER ------------------------
const upload = multer({ storage: multer.memoryStorage() });

// ---------------------- DATABASES ---------------------
await connectMongo();

const lancedb = await connectLance();

let table;
const tables = await lancedb.tableNames();

if (!tables.includes("rag")) {
  table = await lancedb.createTable("rag", [
    {
      chunk: "string",
      embedding: {
        type: "vector",
        dimension: 1536,
      },
    },
  ]);
} else {
  table = await lancedb.openTable("rag");
}

// ------------------------------------------------------
//                       UPLOAD PDF
// ------------------------------------------------------

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log(
      "buffer is Buffer:",
      Buffer.isBuffer(req.file.buffer),
      "length:",
      req.file.buffer.length
    );

    const text = await extractTextFromPDF(req.file.buffer);

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "No valid text found in PDF" });
    }

    // Save document text to MongoDB
    const doc = await Document.create({ originalText: text });

    // Chunk + embed
    const chunks = chunkText(text);

    const rows = await Promise.all(
      chunks.map(async (chunk) => ({
        chunk,
        embedding: await embed(chunk),
      }))
    );

    await table.add(rows);

    res.json({
      message: "PDF processed and stored successfully",
      mongoId: doc._id,
      totalChunks: chunks.length,
    });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({
      error: "Failed to process PDF",
      details: err.message || String(err),
    });
  }
});

// ------------------------------------------------------
//                        QUERY RAG
// ------------------------------------------------------

app.post("/query", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    const qEmbed = await embed(question);

    const result = await table.search(qEmbed).limit(1).execute();

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "No matching chunks found" });
    }

    const best = result[0];

    res.json({
      question,
      bestChunk: best.chunk,
      score: best._distance,
    });
  } catch (err) {
    console.error("QUERY ERROR:", err);
    res.status(500).json({
      error: err.message,
    });
  }
});

// ------------------------------------------------------

app.listen(5000, () => console.log("Server running on port 5000"));
