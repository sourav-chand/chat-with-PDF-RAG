let aiClient;

async function getClient() {
  if (!aiClient) {
    const { GoogleGenAI } = await import('@google/genai');
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

const EMBEDDING_MODEL = 'gemini-embedding-001';
const OUTPUT_DIM = 768;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractVector(emb) {
  if (!emb) throw new Error('Empty embedding response');
  if (Array.isArray(emb.values)) return emb.values;
  if (Array.isArray(emb)) return emb;
  throw new Error('Unexpected embedding shape');
}

async function embedText(text) {
  if (!text || !text.trim()) {
    throw new Error('Cannot embed empty text');
  }

  const ai = await getClient();
  const result = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { outputDimensionality: OUTPUT_DIM },
  });

  const list = result.embeddings || (result.embedding ? [result.embedding] : []);
  if (!list.length) throw new Error('No embeddings returned');
  return extractVector(list[0]);
}

async function embedBatch(texts) {
  const vectors = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    let attempt = 0;
    while (true) {
      try {
        const ai = await getClient();
        const result = await ai.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: batch,
          config: { outputDimensionality: OUTPUT_DIM },
        });

        const list = result.embeddings || [];
        for (const emb of list) vectors.push(extractVector(emb));
        break;
      } catch (err) {
        const msg = (err?.message || '').toLowerCase();
        const isRateLimit =
          err?.status === 429 ||
          msg.includes('rate') ||
          msg.includes('quota') ||
          msg.includes('resource_exhausted');

        if (isRateLimit && attempt < MAX_RETRIES) {
          attempt += 1;
          console.warn(
            `[embedder] Rate limit hit, retrying in ${RETRY_DELAY_MS}ms (attempt ${attempt}/${MAX_RETRIES})`
          );
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw err;
      }
    }

    if (i + BATCH_SIZE < texts.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return vectors;
}

module.exports = { embedText, embedBatch };
