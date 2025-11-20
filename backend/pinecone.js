// pinecone.js
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
dotenv.config();

// Only these two are needed
if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX_NAME) {
  console.warn("Missing PINECONE_API_KEY or PINECONE_INDEX_NAME in .env");
  process.exit(1);
}

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,  // SDK will use https://api.pinecone.io internally
  // do NOT set controllerHostUrl for normal serverless usage
});

const indexName = process.env.PINECONE_INDEX_NAME;

export const pinecone = pc;

export async function getIndex() {
  try {
    return pc.index(indexName); // this resolves the correct index host automatically
  } catch (error) {
    console.error("Error fetching Pinecone index:", error);
    throw error;
  }
}
