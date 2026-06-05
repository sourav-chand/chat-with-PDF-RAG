const { embedText } = require('./embedder');
const { searchSimilar } = require('./vectorStore');
require('dotenv').config();

let aiClient;

async function getClient() {
  if (!aiClient) {
    const { GoogleGenAI } = await import('@google/genai');
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

const CHAT_MODEL = 'gemini-2.5-flash';
const TOP_K = 5;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retrieveContext(userQuery) {
  const queryEmbedding = await embedText(userQuery);
  const results = await searchSimilar(queryEmbedding, TOP_K);

  const context = results
    .map((r, i) => `[Chunk ${i + 1}]\n${r.text}`)
    .join('\n\n');

  return { context, results };
}

function buildPrompt(userQuery, context) {
  return `You are a helpful assistant. Answer the user's question using ONLY the provided context from the PDF. If the answer is not in the context, say 'I could not find this information in the PDF.'

Context: ${context}

Question: ${userQuery}`;
}

function extractText(result) {
  if (typeof result?.text === 'string' && result.text) return result.text;
  const cand = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (cand) return cand;
  throw new Error('Unexpected generateContent response shape');
}

async function generateAnswer(userQuery, context) {
  const prompt = buildPrompt(userQuery, context);

  let attempt = 0;
  while (true) {
    try {
      const ai = await getClient();
      const result = await ai.models.generateContent({
        model: CHAT_MODEL,
        contents: prompt,
      });
      return extractText(result);
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
          `[ragChain] Rate limit hit, retrying in ${RETRY_DELAY_MS}ms (attempt ${attempt}/${MAX_RETRIES})`
        );
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
}

async function askQuestion(userQuery) {
  if (!userQuery || !userQuery.trim()) {
    throw new Error('Question cannot be empty');
  }

  const { context, results } = await retrieveContext(userQuery);
  const answer = await generateAnswer(userQuery, context);

  return {
    answer,
    sourcesCount: results.length,
  };
}

module.exports = { askQuestion, retrieveContext, generateAnswer };
