const { QdrantClient } = require('@qdrant/js-client-rest');
require('dotenv').config();

const COLLECTION_NAME = 'pdf_chunks';
const VECTOR_SIZE = 768;
const DISTANCE = 'Cosine';

const client = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

async function isConnected() {
  try {
    await client.getCollections();
    return true;
  } catch (err) {
    return false;
  }
}

async function createCollection() {
  try {
    const exists = await client.collectionExists(COLLECTION_NAME);
    if (exists.exists) {
      await client.deleteCollection(COLLECTION_NAME);
      console.log(`[vectorStore] Deleted existing collection: ${COLLECTION_NAME}`);
    }

    await client.createCollection(COLLECTION_NAME, {
      vectors: {
        size: VECTOR_SIZE,
        distance: DISTANCE,
      },
    });

    console.log(`[vectorStore] Created collection: ${COLLECTION_NAME}`);
  } catch (err) {
    console.error('[vectorStore] createCollection error:', err.message);
    throw new Error(`Qdrant createCollection failed: ${err.message}`);
  }
}

async function upsertChunks(chunks, embeddings) {
  if (!chunks || chunks.length === 0) {
    throw new Error('No chunks to upsert');
  }
  if (embeddings.length !== chunks.length) {
    throw new Error(
      `Mismatch between chunks (${chunks.length}) and embeddings (${embeddings.length})`
    );
  }

  try {
    const points = chunks.map((chunk, i) => ({
      id: chunk.chunkIndex,
      vector: embeddings[i],
      payload: {
        text: chunk.text,
        chunkIndex: chunk.chunkIndex,
        source: chunk.source,
      },
    }));

    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points,
    });

    console.log(`[vectorStore] Upserted ${points.length} points`);
  } catch (err) {
    console.error('[vectorStore] upsertChunks error:', err.message);
    throw new Error(`Qdrant upsert failed: ${err.message}`);
  }
}

async function searchSimilar(queryEmbedding, topK = 5) {
  try {
    const result = await client.search(COLLECTION_NAME, {
      vector: queryEmbedding,
      limit: topK,
      with_payload: true,
    });

    return result.map((hit) => ({
      id: hit.id,
      score: hit.score,
      text: hit.payload?.text || '',
      chunkIndex: hit.payload?.chunkIndex,
      source: hit.payload?.source,
    }));
  } catch (err) {
    console.error('[vectorStore] searchSimilar error:', err.message);
    throw new Error(`Qdrant search failed: ${err.message}`);
  }
}

module.exports = {
  client,
  isConnected,
  createCollection,
  upsertChunks,
  searchSimilar,
  COLLECTION_NAME,
};
