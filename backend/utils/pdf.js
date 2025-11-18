// utils/pdf.js — text extraction using pdfjs-dist legacy build in Node (ESM)

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// Configure worker for Node/ESM
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.mjs",
  import.meta.url
).toString();

/**
 * Extract all text from a PDF.
 * Accepts Buffer or Uint8Array and always converts to Uint8Array for pdf.js.
 */
export async function extractTextFromPDF(binary) {
  if (!binary) {
    throw new Error("No binary data provided to extractTextFromPDF");
  }

  // ALWAYS convert Buffer -> Uint8Array (no instanceof check)
  const data = new Uint8Array(binary);

  // Load PDF
  const pdf = await getDocument({ data }).promise;

  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");

    fullText += pageText + "\n";
  }

  await pdf.destroy();
  return fullText;
}
