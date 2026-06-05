# Chat with PDF

A RAG (Retrieval-Augmented Generation) application that lets you upload a PDF and ask questions about its content. Built with Node.js, Express, Google Gemini, and Qdrant.

## Architecture

```
PDF ──► Extract ──► Chunk ──► Embed (Gemini) ──► Store (Qdrant)
                                                       │
User question ──► Embed ──► Search top-5 ──► Context ──┘
                                                       │
                                                       ▼
                                              Answer (Gemini Flash)
```

## Tech Stack

- **Runtime:** Node.js (CommonJS)
- **Backend:** Express.js
- **LLM:** Google Gemini (`gemini-2.5-flash` for chat, `gemini-embedding-001` for embeddings)
- **Vector DB:** Qdrant (local Docker container)
- **PDF Parsing:** `pdf-parse`
- **Frontend:** Vanilla HTML/CSS/JS (no frameworks)

## Project Structure

```
chat-with-pdf/
├── server.js              # Express backend, HTTP endpoints
├── rag/
│   ├── pdfProcessor.js    # PDF text extraction + chunking
│   ├── embedder.js        # Gemini embedding calls (batch + retry)
│   ├── vectorStore.js     # Qdrant: create, upsert, search
│   └── ragChain.js        # Retrieve context + generate answer
├── public/
│   └── index.html         # Upload UI + chat UI
├── .env                   # API keys (gitignored)
└── package.json
```

## Prerequisites

- Node.js 18+
- Docker (for Qdrant)
- A Google Gemini API key from [aistudio.google.com](https://aistudio.google.com/app/apikey)

## Setup

1. **Start Qdrant:**
   ```bash
   docker run -p 6333:6333 qdrant/qdrant
   ```
   Or use a different host port: `docker run -p 6334:6333 qdrant/qdrant`

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment** — create `.env`:
   ```
   GEMINI_API_KEY=your_key_here
   QDRANT_URL=http://localhost:6333
   PORT=3000
   ```

4. **Run the server:**
   ```bash
   npm start
   ```

5. Open `http://localhost:3000` in your browser.

## How It Works

### Upload Flow

1. User selects a PDF (drag-drop or file picker) — `public/index.html`
2. `POST /upload` (multipart) is sent to the server — `server.js:36`
3. `multer` stores the file in memory (10 MB cap)
4. `pdfProcessor.extractAndChunk()` splits text into ~2000-char windows with 100-char overlap — `rag/pdfProcessor.js:14`
5. `embedder.embedBatch()` sends chunks to Gemini in batches of 10 with 500ms delay — `rag/embedder.js:64`
6. `vectorStore.createCollection()` drops the old `pdf_chunks` collection and creates a fresh one (768-dim, cosine)
7. `vectorStore.upsertChunks()` stores all points in a single call — `rag/vectorStore.js:46`

### Question Flow

1. User submits a question — `public/index.html`
2. `POST /ask` is sent with `{ question }` — `server.js:79`
3. `ragChain.askQuestion()` orchestrates the rest — `rag/ragChain.js:97`
4. Query is embedded with the same Gemini model
5. Qdrant returns the top-5 most similar chunks — `rag/vectorStore.js:73`
6. Chunks are joined into a context string
7. Gemini Flash is prompted with the system instructions + context + question — `rag/ragChain.js:55`
8. Answer is returned along with `sourcesCount`

## API

### `POST /upload`

Multipart form with a `pdf` field.

**Response:**
```json
{ "success": true, "chunksProcessed": 42 }
```

### `POST /ask`

JSON body: `{ "question": "What is the main topic?" }`

**Response:**
```json
{ "answer": "The main topic is...", "sourcesCount": 5 }
```

### `GET /health`

**Response:**
```json
{ "status": "ok", "qdrant": "connected" }
```

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `GEMINI_API_KEY` | *(required)* | Your Google Gemini API key |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant server URL |
| `PORT` | `3000` | Express server port |

## Inspecting Stored Vectors

Open Qdrant's built-in dashboard:

```
http://localhost:6333/dashboard
```

Browse the `pdf_chunks` collection to see the points, payloads, and visualize the embedding space.

## Error Handling

| Failure | HTTP Code | Behavior |
|---------|-----------|----------|
| Qdrant unreachable | 503 | Clear message about Docker container |
| No file in upload | 400 | "No PDF file uploaded" |
| PDF has no text (image-only) | 400 | "PDF has no extractable text" |
| File > 10 MB | 500 | multer error |
| Gemini rate limit (429) | retry | 3 attempts, 2s delay each |
| Other Gemini errors | 500 | Raw error message returned |

## Notes

- Uploading a new PDF **replaces** the current one (the collection is dropped and recreated each time). One PDF at a time.
- The `source` payload field is stored for future use but not currently displayed in the UI.
- The system prompt explicitly instructs the LLM to say "I could not find this information in the PDF." when the context is insufficient — this prevents hallucination.
