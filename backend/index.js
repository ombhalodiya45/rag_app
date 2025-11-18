// index.js
import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";

import { extractTextFromPDF } from "./utils/pdf.js";
import { connectMongo, connectLance } from "./db.js";
import Document from "./models/Document.js";
import { chunkText } from "./utils/chunk.js";
import { embed } from "./utils/embed.js";

import Groq from "groq-sdk";
dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  console.warn("Warning: GROQ_API_KEY not found in env — embedding and LLM calls will fail.");
}
const groqClient = new Groq({ apiKey: GROQ_API_KEY });

const app = express();
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

// ---------------------- DBs ----------------------
await connectMongo();
const lancedb = await connectLance();

let table;
const tables = await lancedb.tableNames();

// IMPORTANT: text-embedding-3-small → 1536 dims (OpenAI doc / model v3). Use 1536 here.
const EMBEDDING_DIM = 1536;

if (!tables.includes("rag")) {
  table = await lancedb.createTable("rag", [
    {
      chunk: "string",
      sourceId: "string", // optional: reference to mongo doc id
      embedding: {
        type: "vector",
        dimension: EMBEDDING_DIM,
      },
    },
  ]);
} else {
  table = await lancedb.openTable("rag");
}

// ---------------------- HELPERS ----------------------

// Throttle embeddings: prevent firing all concurrently.
// concurrency=1 to be safe with free tiers
async function embedChunksSequentially(chunks, { delayMs = 200 } = {}) {
  const rows = [];
  for (const chunk of chunks) {
    // small protection: skip extremely long
    if (chunk.length > 8000) {
      console.warn("Skipping very long chunk; consider re-chunking", chunk.length);
      continue;
    }

    const vector = await embed(chunk); // uses utils/embed.js (has retries)
    rows.push({ chunk, embedding: vector });
    // brief pause to reduce load
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  return rows;
}

// ---------------------- ROUTES ----------------------

// Upload PDF
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log("buffer is Buffer:", Buffer.isBuffer(req.file.buffer), "length:", req.file.buffer.length);

    const text = await extractTextFromPDF(req.file.buffer);
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "No valid text found in PDF" });
    }

    const doc = await Document.create({ originalText: text });

    // chunk and embed
    const chunks = chunkText(text, 1000); // ~1000 char chunks
    console.log("Chunks created:", chunks.length);

    // embed sequentially with delay to avoid overload
    const rows = await embedChunksSequentially(chunks, { delayMs: 200 });

    // attach source id (mongo id) and upsert into lance
    const rowsWithMeta = rows.map((r) => ({ ...r, sourceId: String(doc._id) }));

    // add rows in batches (Lance may accept array)
    await table.add(rowsWithMeta);

    res.json({
      message: "PDF processed and stored successfully",
      mongoId: doc._id,
      totalChunks: chunks.length,
    });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({
      error: "Failed to process PDF",
      details: err?.message || String(err),
    });
  }
});

// Query RAG: search + LLM answer
app.post("/query", async (req, res) => {
  try {
    const { question, topK = 5 } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }

    // 1) create embedding for question
    const qEmbed = await embed(question);

    // 2) search top-k
    const result = await table.search(qEmbed).limit(topK).execute();

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "No matching chunks found" });
    }

    // 3) build context from top results
    const context = result.map((r, i) => `Chunk ${i + 1}:\n${r.chunk}`).join("\n\n---\n\n");

    // 4) create prompt for LLM
    const prompt = [
      {
        role: "system",
        content:
          "You are an assistant that answers user questions using only the provided context. If not enough information is present, say you don't know and provide guidance.",
      },
      {
        role: "user",
        content: `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer concisely, cite the chunk numbers if used.`,
      },
    ];

    // 5) call Groq LLM to generate answer (if desired)
    let llmAnswer = null;
    try {
      const chatResp = await groqClient.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: prompt,
        max_tokens: 512,
        temperature: 0.1,
      });

      llmAnswer = chatResp?.choices?.[0]?.message?.content ?? null;
    } catch (llmErr) {
      console.warn("LLM generation failed, returning best chunk(s) instead", llmErr?.message || llmErr);
    }

    res.json({
      question,
      bestChunks: result.map((r) => ({ chunk: r.chunk, score: r._distance, sourceId: r.sourceId })),
      answer: llmAnswer,
    });
  } catch (err) {
    console.error("QUERY ERROR:", err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.listen(5000, () => console.log("Server running on port 5000"));
