// index.js
import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";

import { extractTextFromPDF } from "./utils/pdf.js";
import { connectMongo, connectLance } from "./db.js";
import Document from "./models/Document.js";
import { chunkText } from "./utils/chunk.js";
import { embed } from "./utils/embed.js"; // HuggingFace embeddings

// Groq LLM (optional)
import Groq from "groq-sdk";

dotenv.config();

// ---------------------- GROQ LLM ----------------------
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const groqClient = new Groq({ apiKey: GROQ_API_KEY });

// ---------------------- EXPRESS ----------------------
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

// ---------------------- DB INIT ----------------------
await connectMongo();
const lancedb = await connectLance();

let table;
const tables = await lancedb.tableNames();

// HuggingFace "all-mpnet-base-v2" → 768 dims
const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || 768);
console.log("Using embedding size:", EMBEDDING_DIM);


if (!tables.includes("rag")) {
  table = await lancedb.createTable("rag", [
    {
      chunk: "string",
      sourceId: "string",
      embedding: {
        type: "vector",
        dimension: EMBEDDING_DIM,
      },
    },
  ]);
  console.log("Created LanceDB table: rag");
} else {
  table = await lancedb.openTable("rag");
  console.log("Opened LanceDB table: rag");
}

// ---------------------- HELPERS ----------------------
async function embedChunksSequentially(chunks, { delayMs = 200 } = {}) {
  const rows = [];

  for (const chunk of chunks) {
    if (!chunk.trim()) continue; // skip empty
    if (chunk.length > 8000) continue;

    const vector = await embed(chunk);

    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIM) {
      console.log("❌ Skipping invalid vector len:", vector.length);
      continue;
    }

    rows.push({ chunk, embedding: vector });

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

    const text = await extractTextFromPDF(req.file.buffer);
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "No valid text found in PDF" });
    }

    const doc = await Document.create({ originalText: text });

    const chunks = chunkText(text, 1000);

    const rows = await embedChunksSequentially(chunks, { delayMs: 200 });

    const rowsWithMeta = rows.map((r) => ({
      ...r,
      sourceId: String(doc._id),
    }));

    await table.add(rowsWithMeta);

    res.json({
      message: "PDF processed and stored successfully",
      mongoId: doc._id,
      totalChunks: rowsWithMeta.length,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to process PDF",
      details: err?.message || String(err),
    });
  }
});

// Query RAG
app.post("/query", async (req, res) => {
  try {
    const { question, topK = 5 } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }

    // 1. Embed the question
    const qEmbed = await embed(question);
    console.log("Query embed size:", qEmbed.length);

   if (!Array.isArray(qEmbed)) {
  return res.status(500).json({ error: "Embedding output invalid" });
}

if (qEmbed.length !== EMBEDDING_DIM) {
  return res.status(500).json({
    error: `Embedding size mismatch: expected ${EMBEDDING_DIM}, got ${qEmbed.length}`,
  });
}


    // 2. LanceDB Search
    const result = await table.search(qEmbed).limit(topK).execute();

    const rows = result.data; // ✔ Correct handling

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "No matching chunks found" });
    }

    // 3. Build context
    const context = rows
      .map((r, i) => `Chunk ${i + 1}:\n${r.chunk}`)
      .join("\n\n---\n\n");

    // 4. Prompt for LLM
    const prompt = [
      {
        role: "system",
        content:
          "You are an assistant that answers user questions using ONLY the provided context.",
      },
      {
        role: "user",
        content: `Context:\n${context}\n\nQuestion: ${question}\n\nProvide a short answer.`,
      },
    ];

    // 5. Groq LLM
    let llmAnswer = null;
    try {
      const chatResp = await groqClient.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: prompt,
        max_tokens: 512,
        temperature: 0.1,
      });

      llmAnswer = chatResp?.choices?.[0]?.message?.content ?? null;
    } catch {
      llmAnswer = null;
    }

    res.json({
      question,
      bestChunks: rows.map((r) => ({
        chunk: r.chunk,
        score: r._distance,
        sourceId: r.sourceId,
      })),
      answer: llmAnswer,
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.listen(5000, () => console.log("Server running on port 5000"));
