// backend/utils/pdf.js
// Text extraction using @cedrugs/pdf-parse (pure ESM, default export)

import pdf from "@cedrugs/pdf-parse"; // ESM-friendly wrapper [web:282]

/**
 * Extract text from a PDF.
 * Accepts Node Buffer (from multer) or Uint8Array.
 */
export async function extractTextFromPDF(binary) {
  if (!binary) {
    throw new Error("No binary data provided to extractTextFromPDF");
  }

  // Normalize to Buffer because @cedrugs/pdf-parse is happy with it [web:282]
  const buf = Buffer.isBuffer(binary) ? binary : Buffer.from(binary);

  const data = await pdf(buf); // pdf is a function: pdf(Buffer) -> { text, ... } [web:282][web:283]
  const text = data.text || "";

  if (!text.trim()) {
    throw new Error("No text could be extracted from the PDF");
  }

  return text;
}
