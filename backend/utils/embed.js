// utils/embed.js
import dotenv from "dotenv";
dotenv.config();

import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient(process.env.HF_API_KEY);

export async function embed(text) {
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`HuggingFace Embed Attempt ${attempt}`);

      const result = await client.featureExtraction({
        model: "sentence-transformers/all-mpnet-base-v2",
        inputs: text,
      });

      // Normalize nested output → flatten
      const vector = Array.isArray(result[0]) ? result[0] : result;

      return Float32Array.from(vector);

    } catch (err) {
      console.log(`Embed attempt ${attempt} failed →`, err?.message || err);

      if (attempt === maxRetries) {
        throw new Error(`HF embedding failed after ${maxRetries} attempts`);
      }

      // exponential backoff
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
}
