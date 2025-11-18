// utils/chunk.js
export function chunkText(text, maxLen = 1000) {
  if (!text) return [];

  const chunks = [];
  let start = 0;
  const length = text.length;

  while (start < length) {
    let end = Math.min(start + maxLen, length);

    if (end < length) {
      // try to find nearest sentence boundary within the last 200 chars
      const windowStart = Math.max(start, end - 200);
      const period = text.lastIndexOf(".", end);
      const newline = text.lastIndexOf("\n", end);
      const breakPoint = Math.max(period, newline);

      if (breakPoint > windowStart) {
        end = breakPoint + 1;
      } else {
        // try comma or space fallback
        const comma = text.lastIndexOf(",", end);
        const space = text.lastIndexOf(" ", end);
        const bp2 = Math.max(comma, space);
        if (bp2 > windowStart) end = bp2 + 1;
      }
    }

    const slice = text.slice(start, end).trim();
    if (slice.length > 0) chunks.push(slice);
    start = end;
  }

  return chunks;
}
