import dotenv from "dotenv";
dotenv.config();

import Groq from "groq-sdk";

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// SAFE EMBEDDING FUNCTION WITH RETRIES
export async function embed(text) {
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Groq Embed Attempt ${attempt}`);

      const res = await client.embeddings.create({
        model: "nomic-embed-text",   // ✔ FIXED MODEL
        input: text,
      });

      return res.data[0].embedding;

    } catch (err) {
      console.log(`Embed attempt ${attempt} failed →`, err?.status || err);

      // last attempt → throw
      if (attempt === maxRetries) {
        throw new Error(`Groq embedding failed after ${maxRetries} attempts.`);
      }

      // wait before retry
      await new Promise(r => setTimeout(r, attempt * 400));
    }
  }
}
