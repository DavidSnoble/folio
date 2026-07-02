# Folio — Master Build Plan

> **Goal:** Build a Kindle-like local-first e-reader PWA while learning React, TypeScript, PWAs, and Kubernetes deployment — all relevant to a Cohere application.

**Stack:** React + TypeScript + Vite · Python + FastAPI + SQLite/Postgres · Dexie.js + Workbox · Docker + Kubernetes

**Principle:** Local-first. IndexedDB is the source of truth. The FastAPI backend is an optional sync target — the app works fully offline.

---

## Phase 1: Backend First (Python/FastAPI) 🐍

*Start in your comfort zone. Build the API you know. Get a quick win.*

### What you'll build
- A FastAPI server that accepts EPUB/PDF uploads
- Book metadata CRUD (title, author, cover, file path)
- File storage on local disk (`storage/books/`)
- SQLite database for metadata

### Key learning
- FastAPI project structure (routers, models, schemas, services)
- File upload handling with streaming
- SQLAlchemy + Alembic migrations
- Pydantic schemas for request/response validation

### Endpoints
```
POST   /api/books          — Upload a book file + metadata
GET    /api/books          — List all books
GET    /api/books/{id}     — Get book metadata
GET    /api/books/{id}/content — Stream the book file
DELETE /api/books/{id}     — Delete a book
```

### Deliverable
`curl`-able API: upload an EPUB, list it, download it back. All via terminal.

### Files you'll create
```
backend/
  app/
    main.py           — FastAPI app, CORS middleware
    config.py         — Settings from environment
    database.py       — SQLAlchemy engine + session
    models/
      book.py         — Book SQLAlchemy model
    schemas/
      book.py         — Pydantic request/response schemas
    routers/
      books.py        — Book CRUD endpoints
    services/
      storage.py      — File save/retrieve/delete
  alembic/            — DB migrations
  storage/books/      — Uploaded files (gitignored)
  requirements.txt
  Dockerfile
```

---

## Phase 2: Bare React Frontend 📚

*Now learn React. Start simple — no reader, just a library shelf.*

### What you'll build
- Vite + React + TypeScript project
- A page that fetches your book list from the backend
- A book upload form (drag-and-drop or file picker)
- Display books as a grid of covers

### Key React concepts you'll learn
- Components and props
- `useState` and `useEffect`
- Fetching data from an API
- Handling forms and file uploads
- Basic CSS/Tailwind styling
- TypeScript basics (types for props, API responses)

### Component tree
```
App
├── Header
├── Library
│   └── BookCard (×N)
│       ├── Cover image
│       ├── Title / Author
│       └── Format badge (EPUB/PDF)
└── Uploader
    └── File drop zone + button
```

### Deliverable
Open `localhost:5173`, see your uploaded books, upload a new one. All talking to your FastAPI backend.

### Files you'll create
```
frontend/
  src/
    App.tsx
    components/
      Header.tsx
      Library.tsx
      BookCard.tsx
      Uploader.tsx
    api/
      books.ts         — fetch wrapper for book API
    types/
      book.ts          — Book interface
  vite.config.ts
  tailwind.config.js
```

---

## Phase 3: The Reader 📖

*This is the core of the app — rendering pages and flipping through them.*

### What you'll build
- Click a book → enter reader mode
- EPUB: rendered with epub.js (or similar library)
- PDF: rendered with pdfjs-dist
- Page flipping: tap/click left/right, or swipe on mobile
- Current page indicator ("Page 42 of 320")
- Reading progress persisted in React state (not yet IndexedDB)

### Key React concepts you'll learn
- `useRef` for DOM access (the reader container)
- `useCallback` and `useMemo` for performance
- Conditional rendering (reader mode vs library mode)
- React Router (optional — can use simple state-based routing)

### Component tree (reader mode)
```
Reader
├── ReaderToolbar
│   ├── BackToLibrary button
│   ├── Title
│   └── Page indicator
├── ReaderViewport
│   └── (epub.js or pdf.js rendered content)
└── PageControls
    ├── Previous page (left tap zone)
    └── Next page (right tap zone)
```

### Library decisions
- **epub.js**: The standard for browser EPUB rendering. Solid, well-documented.
- **pdfjs-dist**: Mozilla's PDF.js, the same engine Firefox uses. Reliable but can be heavy.
- **Alternative approach**: For EPUBs, you could parse the EPUB (it's just a ZIP of HTML files) and render chapters as scrollable divs. Simpler but less polished.

### Deliverable
Open a book from your library, flip pages with taps/swipes, see your progress.

---

## Phase 4: Local-First Storage 💾

*Make the app work without the backend running. This is the key architectural decision.*

### What you'll build
- Dexie.js database in IndexedDB
- Store books (as blobs), covers, metadata, and reading progress
- On app load: read from IndexedDB first, then try backend
- On upload: save to IndexedDB immediately, then sync to backend if available
- Backend status indicator (🟢 online / 🔴 offline)

### Key concepts you'll learn
- IndexedDB API (via Dexie.js's much nicer wrapper)
- Blob storage in the browser
- Offline-first data flow: local is source of truth, remote is eventually consistent
- `navigator.onLine` and online/offline events

### Data flow
```
Upload book:
  1. User picks file
  2. Save to IndexedDB (blob + metadata) — IMMEDIATE (works offline)
  3. If online: POST to backend
  4. If offline: queue for later sync

Open app:
  1. Load from IndexedDB — instant
  2. If online: fetch from backend, merge any new books
  3. Show library

Reading progress:
  1. On page change: save to IndexedDB
  2. Debounced sync to backend (every 5 seconds or on pause)
```

### IndexedDB schema (Dexie.js)
```typescript
// Books table
{ id, title, author, format, coverBlob, fileBlob, addedAt, updatedAt }

// ReadingProgress table
{ id, bookId, currentPage, totalPages, percentage, updatedAt }

// SyncQueue table
{ id, operation, table, recordId, data, timestamp }
```

### Deliverable
Kill the backend. App still works — browse library, open books, read, track progress. Bring backend back up, data syncs.

---

## Phase 5: PWA — Make It Installable 📱

*Turn your website into something that feels like a native app on mobile.*

### What you'll build
- Service worker with Workbox
- `manifest.json` for "Add to Home Screen"
- Cache strategy: app shell (precached), book content (runtime cache)
- Offline fallback page
- Install prompt

### Key concepts you'll learn
- Service worker lifecycle (install → activate → fetch)
- Cache strategies: CacheFirst, NetworkFirst, StaleWhileRevalidate
- PWA manifest: icons, theme color, display mode (standalone)
- iOS PWA quirks (it works but has limitations)

### Workbox strategies
| Resource | Strategy | Why |
|----------|----------|-----|
| App shell (HTML/JS/CSS) | Precache | Always available, versioned |
| Book covers | CacheFirst | Don't change often |
| Book content (EPUB/PDF) | CacheFirst | Large, don't re-download |
| API calls | NetworkFirst | Want fresh data if possible |
| Reading progress sync | NetworkFirst | Sync is sync |

### Deliverable
Open on iPhone Safari → "Add to Home Screen" → opens as standalone app → works in airplane mode.

---

## Phase 6: Sync Protocol 🔄

*Connect the local and remote worlds with a proper sync layer.*

### What you'll build
**Backend:**
- `POST /sync/push` — client sends all local changes since last sync
- `POST /sync/pull` — client requests all remote changes since a timestamp

**Frontend:**
- On app startup: pull remote changes, merge with local
- On change (progress, bookmark): push to backend if online
- Conflict resolution: last-write-wins (compare `updated_at` timestamps)

### Sync protocol (simple, not CRDTs)
```
PUSH request:
{
  "changes": [
    {
      "table": "reading_progress",
      "record_id": "abc123",
      "operation": "upsert",
      "data": { "bookId": "...", "currentPage": 42, "percentage": 0.13 },
      "updated_at": "2026-07-02T20:00:00Z"
    }
  ]
}

PULL request:
{
  "since": "2026-07-02T19:00:00Z"
}

PULL response:
{
  "changes": [...],  // all changes since 'since'
  "server_time": "2026-07-02T20:05:00Z"  // client stores as last_pull_at
}
```

### Conflict resolution (last-write-wins)
```
On push:
  For each change:
    Load server record
    If server.updated_at > change.updated_at → ignore (server is newer)
    If server.updated_at <= change.updated_at → overwrite (client is newer or tie)

On pull:
  For each change:
    Load local record
    If local.updated_at > change.updated_at → ignore (local is newer)
    If local.updated_at <= change.updated_at → overwrite (remote is newer or tie)
```

### Deliverable
Read 10 pages on phone → open laptop → same book opens at page 10.

---

## Phase 7: Kubernetes Deployment 🐳→☸️

*Graduate from Docker Compose to a real cluster. This is the Cohere-relevant infrastructure piece.*

### What you'll build

**Step A: Docker Compose (what you know)**
- `Dockerfile` for backend (multi-stage, slim Python base)
- `Dockerfile` for frontend (Vite build → Nginx serve)
- `docker-compose.yml` with bind mounts for hot reload

**Step B: Minikube/k3s (single node)**
- Deployments for frontend + backend
- ClusterIP Services
- Learn: `kubectl get/logs/describe/apply`

**Step C: Networking + Storage (multi-service)**
- Ingress controller (nginx-ingress)
- Ingress rules: `/` → frontend, `/api` → backend
- ConfigMap for settings, Secret for DB password
- PersistentVolumeClaim for book uploads

**Step D: Production hardening**
- Resource requests/limits
- Liveness + readiness probes
- Postgres StatefulSet (or separate Deployment)
- CI/CD with GitHub Actions (build + `kubectl apply`)

### K8s resources you'll create
```yaml
# For each service (frontend, backend, postgres):
- Deployment        # "Keep N pods running"
- Service           # "Give them a stable IP"
- ConfigMap         # "Settings as environment variables"
- Secret            # "Passwords and keys"

# For routing:
- Ingress           # "Route folio.example.com → frontend, /api → backend"

# For data:
- PersistentVolumeClaim  # "I need 5GB of disk that survives restarts"
```

### Key pitfalls to watch for
| Pitfall | Fix |
|---------|-----|
| Stateful data without PVC | Mount a PVC for book uploads and DB |
| Hardcoded API URLs | Use Ingress path rewrites or build-time env vars |
| No resource limits | Set `requests` and `limits` on every Deployment |
| Secrets in plain text | Use K8s Secrets (base64 is NOT encryption, but it's better than hardcoding) |
| Port mismatches | Double-check `targetPort` matches container's listening port |

### Deliverable
`kubectl get all` shows your app running. `curl folio.example.com` returns the reader. Books survive pod restarts.

---

## Summary: Learning Order

| Phase | Focus | New Skills | Time Est. |
|-------|-------|------------|-----------|
| 1 | Backend | FastAPI, SQLAlchemy, file uploads | 1-2 days |
| 2 | React basics | Components, hooks, fetch, Tailwind | 3-5 days |
| 3 | Reader | epub.js/pdf.js, refs, performance | 3-5 days |
| 4 | Local-first | Dexie.js, IndexedDB, offline flow | 2-3 days |
| 5 | PWA | Service workers, Workbox, manifest | 1-2 days |
| 6 | Sync | Push/pull protocol, conflict resolution | 2-3 days |
| 7 | K8s | Dockerfiles, Compose, minikube, K8s | 5-7 days |

**Total: ~3-4 weeks** of focused evenings/weekends.

---

## Cohere Relevance

Every phase maps to skills Cohere values:

- **FastAPI + Python** — Their primary API stack
- **File handling at scale** — ML models deal with large files
- **Sync/distributed patterns** — Multi-region inference serving
- **TypeScript + React** — Their dashboard and tooling
- **Kubernetes** — Their deployment infrastructure
- **Offline-first architecture** — Robustness patterns they respect
