require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { extractAndChunk } = require('./rag/pdfProcessor');
const { embedBatch } = require('./rag/embedder');
const { isConnected, createCollection, upsertChunks } = require('./rag/vectorStore');
const { askQuestion } = require('./rag/ragChain');

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:4200';

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const angularDist = path.join(__dirname, '..', 'frontend', 'dist', 'frontend', 'browser');
const serveFrontend = fs.existsSync(angularDist);
if (serveFrontend) {
  app.use(express.static(angularDist));
  app.get(/^\/(?!upload|ask|health).*/, (_req, res) => {
    res.sendFile(path.join(angularDist, 'index.html'));
  });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.get('/health', async (req, res) => {
  try {
    const connected = await isConnected();
    res.json({
      status: 'ok',
      qdrant: connected ? 'connected' : 'disconnected',
    });
  } catch (err) {
    res.status(503).json({ error: 'Qdrant unavailable' });
  }
});

app.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log('[upload] Received file:', req.file.originalname);

    const connected = await isConnected();
    if (!connected) {
      return res.status(503).json({
        error: 'Qdrant is not reachable. Make sure Docker container is running.',
      });
    }

    console.log('[upload] Step 1/3: Extracting and chunking PDF...');
    const chunks = await extractAndChunk(req.file.buffer, req.file.originalname);
    console.log(`[upload] Extracted ${chunks.length} chunks`);

    console.log('[upload] Step 2/3: Generating embeddings via Gemini...');
    const texts = chunks.map((c) => c.text);
    const embeddings = await embedBatch(texts);
    console.log(`[upload] Generated ${embeddings.length} embeddings`);

    console.log('[upload] Step 3/3: Storing vectors in Qdrant...');
    await createCollection();
    await upsertChunks(chunks, embeddings);
    console.log('[upload] Done!');

    res.json({
      success: true,
      chunksProcessed: chunks.length,
    });
  } catch (err) {
    console.error('[upload] Error:', err.message);
    const msg = err.message || '';

    if (msg.includes('no extractable text')) {
      return res.status(400).json({ error: msg });
    }
    if (msg.toLowerCase().includes('qdrant')) {
      return res.status(503).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

app.post('/ask', async (req, res) => {
  try {
    const { question } = req.body || {};
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const connected = await isConnected();
    if (!connected) {
      return res.status(503).json({
        error: 'Qdrant is not reachable. Make sure Docker container is running.',
      });
    }

    console.log(`[ask] Question: "${question}"`);
    const { answer, sourcesCount } = await askQuestion(question);
    console.log(`[ask] Answered using ${sourcesCount} chunks`);

    res.json({ answer, sourcesCount });
  } catch (err) {
    console.error('[ask] Error:', err.message);
    const msg = err.message || '';
    if (msg.toLowerCase().includes('qdrant')) {
      return res.status(503).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`\n=== Chat with PDF ===`);
  console.log(`Backend API:  http://localhost:${PORT}`);
  console.log(`CORS origin:  ${CORS_ORIGIN}`);
  console.log(`Qdrant:       ${process.env.QDRANT_URL || 'http://localhost:6333'}`);
  if (serveFrontend) {
    console.log(`Serving UI:   http://localhost:${PORT}  (from ${angularDist})`);
  } else {
    console.log(`Serving UI:   (not built) — run "npm run build" from the project root,`);
    console.log(`               or run the Angular dev server on ${CORS_ORIGIN}`);
  }
  console.log(`Make sure Qdrant is running: docker run -p 6333:6333 qdrant/qdrant\n`);
});
