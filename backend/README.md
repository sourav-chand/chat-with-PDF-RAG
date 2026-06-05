# Chat with PDF

A RAG (Retrieval-Augmented Generation) application that lets you upload a PDF and ask questions about its content. Built with Node.js, Express, Angular 21, Google Gemini, and Qdrant.

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
- **Backend:** Express.js + `cors`
- **LLM:** Google Gemini (`gemini-2.5-flash` for chat, `gemini-embedding-001` for embeddings)
- **Vector DB:** Qdrant (local Docker container)
- **PDF Parsing:** `pdf-parse`
- **Frontend:** Angular 21 (standalone components, signals, zoneless change detection)

## Project Structure

```
chat-with-pdf/
├── package.json             # Root workspace: orchestrates both apps
├── backend/                 # Node.js Express API
│   ├── server.js            # Express + CORS + static serving for built UI
│   ├── rag/
│   │   ├── pdfProcessor.js  # PDF text extraction + chunking
│   │   ├── embedder.js      # Gemini embedding calls (batch + retry)
│   │   ├── vectorStore.js   # Qdrant: create, upsert, search
│   │   └── ragChain.js      # Retrieve context + generate answer
│   ├── .env                 # API keys + CORS_ORIGIN
│   └── package.json
└── frontend/                # Angular 21 app
    ├── src/app/
    │   ├── components/
    │   │   ├── upload.component.ts   # Drag-drop PDF picker
    │   │   └── chat.component.ts     # Chat UI
    │   ├── services/
    │   │   └── api.service.ts        # HttpClient → /upload, /ask
    │   ├── models/
    │   │   └── chat-message.ts
    │   ├── app.ts
    │   └── app.config.ts
    ├── proxy.conf.json      # Dev proxy: /upload, /ask, /health → :3000
    ├── angular.json
    └── package.json
```

## How the frontend and backend connect

The two apps are **independent** (different ports, different `package.json`) but wired together three ways:

| Layer | What it does |
|-------|--------------|
| **CORS** (`backend/server.js:17`) | Backend allows requests from `CORS_ORIGIN` (default `http://localhost:4200`). Required when the Angular dev server calls the API on `:3000`. |
| **Dev proxy** (`frontend/proxy.conf.json`) | Angular dev server forwards `/upload`, `/ask`, `/health` to `http://localhost:3000` so the frontend can use relative URLs with no CORS in the browser path. |
| **Production serving** (`backend/server.js:20`) | When the frontend is built (`npm run build`), the backend serves `frontend/dist/frontend/browser` as static files and falls back to `index.html` for unknown routes (SPA). |

## Prerequisites

- Node.js 22+
- Docker (for Qdrant)
- A Google Gemini API key from [aistudio.google.com](https://aistudio.google.com/app/apikey)

## Setup

From the project **root**:

1. **Start Qdrant:**
   ```bash
   docker run -p 6333:6333 qdrant/qdrant
   ```
   Or use a different host port: `docker run -p 6334:6333 qdrant/qdrant`.

2. **Install both apps:**
   ```bash
   npm run install:all
   ```
   This runs `npm install` in `backend/` and `frontend/`.

3. **Configure `backend/.env`:**
   ```
   GEMINI_API_KEY=your_key_here
   QDRANT_URL=http://localhost:6333
   PORT=3000
   CORS_ORIGIN=http://localhost:4200
   ```

## Running

All commands below are run from the **project root**.

### Dev — both apps at once (recommended)
```bash
npm run dev
```
This uses `concurrently` to start:
- Backend on `http://localhost:3000` (with `--watch` for auto-reload)
- Frontend on `http://localhost:4200` (with HMR)

Open `http://localhost:4200`. The dev proxy forwards `/upload`, `/ask`, `/health` to the backend.

### Dev — separate terminals
```bash
npm run dev:backend   # terminal 1 → http://localhost:3000
npm run dev:frontend  # terminal 2 → http://localhost:4200
```

### Production — single port
```bash
npm run start:prod
```
This builds the frontend into `frontend/dist/frontend/browser` and starts the backend, which serves the built UI on `http://localhost:3000`.

If the frontend has not been built, the backend still starts on `:3000` and exposes the API. The browser should be pointed at the Angular dev server (`:4200`) or the frontend should be built first.

## How It Works

### Upload Flow

1. User selects a PDF (drag-drop or file picker) — `frontend/src/app/components/upload.component.ts`
2. `POST /upload` (multipart) is sent to the server via `ApiService.uploadPdf()` — `server.js:36`
3. `multer` stores the file in memory (10 MB cap)
4. `pdfProcessor.extractAndChunk()` splits text into ~2000-char windows with 100-char overlap — `rag/pdfProcessor.js:14`
5. `embedder.embedBatch()` sends chunks to Gemini in batches of 10 with 500ms delay — `rag/embedder.js:64`
6. `vectorStore.createCollection()` drops the old `pdf_chunks` collection and creates a fresh one (768-dim, cosine)
7. `vectorStore.upsertChunks()` stores all points in a single call — `rag/vectorStore.js:46`

### Question Flow

1. User submits a question — `frontend/src/app/components/chat.component.ts`
2. `POST /ask` is sent with `{ question }` via `ApiService.ask()` — `server.js:79`
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
