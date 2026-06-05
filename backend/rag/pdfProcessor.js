const pdfParse = require('pdf-parse');

const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 100;

function chunkText(text, source) {
  const cleanText = text.replace(/\s+/g, ' ').trim();

  if (!cleanText) {
    return [];
  }

  const chunks = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < cleanText.length) {
    const end = Math.min(start + CHUNK_SIZE, cleanText.length);
    const slice = cleanText.slice(start, end);

    chunks.push({
      text: slice,
      chunkIndex,
      source,
    });

    chunkIndex += 1;

    if (end >= cleanText.length) break;
    start = end - CHUNK_OVERLAP;
  }

  return chunks;
}

async function extractAndChunk(pdfBuffer, source = 'uploaded.pdf') {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
    throw new Error('Invalid PDF buffer provided');
  }

  const parsed = await pdfParse(pdfBuffer);

  if (!parsed.text || parsed.text.trim().length === 0) {
    throw new Error('PDF has no extractable text');
  }

  const chunks = chunkText(parsed.text, source);

  if (chunks.length === 0) {
    throw new Error('PDF has no extractable text');
  }

  return chunks;
}

module.exports = { extractAndChunk, chunkText };
