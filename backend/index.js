import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";

import { extractTextFromPDF } from "./utils/pdf.js";
import { connectMongo } from "./db.js"; // MongoDB connection remains unchanged
import Document from "./models/Document.js";
import { chunkText } from "./utils/chunk.js";
import { embed } from "./utils/embed.js"; // HuggingFace embeddings

// Pinecone integration
import { getIndex } from "./pinecone.js"; // Assuming you created pinecone.js

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
// MongoDB connection (LanceDB is removed, Pinecone will be used instead)
await connectMongo();

// Embedding dimension size
const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || 768);
console.log("Using embedding size:", EMBEDDING_DIM);

// ---------------------- HELPERS ----------------------
async function embedChunksSequentially(chunks, { delayMs = 200 } = {}) {
  const rows = [];

  for (const chunk of chunks) {
    if (!chunk.trim()) continue; // skip empty
    if (chunk.length > 8000) continue;

    const vector = await embed(chunk);

    console.log("Chunk embed isArray:", Array.isArray(vector));
    console.log("Chunk embed length:", vector?.length);

    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIM) {
      console.log("❌ Skipping invalid vector len:", vector?.length);
      continue;
    }

    // Ensure plain array
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

    // Replace LanceDB insert with Pinecone upsert
    const index = await getIndex();
    const vectors = rowsWithMeta.map((r, i) => ({
      id: `${doc._id}-${i}`,
      values: r.embedding,
      metadata: {
        chunk: r.chunk,
        sourceId: String(doc._id),
      },
    }));

    await index.upsert(vectors);
    console.log("Inserted rows into Pinecone:", vectors.length);

    res.json({
      message: "PDF processed and stored successfully",
      mongoId: doc._id,
      totalChunks: vectors.length,
    });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({
      error: "Failed to process PDF",
      details: err?.message || String(err),
    });
  }
});

// Query Pinecone
app.post("/query", async (req, res) => {
  try {
    const { question, topK = 5 } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }

    // 1. Embed the question
    const qEmbed = await embed(question);
    console.log("Query embed size:", qEmbed?.length);
    console.log("qEmbed isArray:", Array.isArray(qEmbed));
    console.log("qEmbed class:", qEmbed?.constructor?.name);

    if (!Array.isArray(qEmbed)) {
      return res.status(500).json({ error: "Embedding output invalid" });
    }

    if (qEmbed.length !== EMBEDDING_DIM) {
      return res.status(500).json({
        error: `Embedding size mismatch: expected ${EMBEDDING_DIM}, got ${qEmbed.length}`,
      });
    }

    // 2. Pinecone Search
    const index = await getIndex();
    const queryResult = await index.query({
      vector: qEmbed,
      topK: topK,
      includeMetadata: true,
    });

    const matches = queryResult.matches;

    if (!matches || matches.length === 0) {
      return res.status(404).json({ error: "No matching chunks found" });
    }

    // 3. Build context
    const context = matches
      .map((m, i) => `Chunk ${i + 1}:\n${m.metadata.chunk}`)
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
    } catch (llmErr) {
      console.error("Groq LLM error:", llmErr?.message || llmErr);
      llmAnswer = null;
    }

    res.json({
      question,
      bestChunks: matches.map((m) => ({
        chunk: m.metadata.chunk,
        score: m._score,  // Pinecone's similarity score
        sourceId: m.metadata.sourceId,
      })),
      answer: llmAnswer,
    });
  } catch (err) {
    console.error("QUERY ERROR:", err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});
app.get("/test-pinecone", async (_req, res) => {
  try {
    const index = await getIndex();
    const stats = await index.describeIndexStats();
    res.json({ ok: true, stats });
  } catch (err) {
    console.error("Pinecone test error:", err);
    res.status(500).json({ ok: false, error: err.message, stack: err.stack });
  }
});


app.listen(5000, () => console.log("Server running on port 5000"));
