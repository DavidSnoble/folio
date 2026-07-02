# Folio

A local-first e-reader progressive web app. Read EPUBs and PDFs offline, sync your progress when online.

**Stack:** React + TypeScript (frontend), Python + FastAPI (backend), Kubernetes (deployment)

## Why Folio?

- 📖 Kindle-like reading experience in your browser
- 📱 Works as a PWA — install on iOS/Android, read offline
- 🔄 Local-first: all your books and progress live in IndexedDB
- ☁️ Sync to backend when you're online (optional)
- 🐳 Kubernetes-ready deployment

## Architecture

```
Browser (PWA)
├── React Reader UI
├── IndexedDB (Dexie.js) — local source of truth
└── Service Worker — offline caching

FastAPI Backend (sync target, not required)
├── Book upload/storage
├── Reading progress sync
└── Last-write-wins conflict resolution
```

## Build Phases

1. **Backend first** — FastAPI CRUD for books
2. **React frontend** — Library + upload
3. **The reader** — EPUB/PDF page rendering
4. **Local-first** — IndexedDB for offline
5. **PWA** — Service worker, installable
6. **Sync** — Push/pull protocol
7. **K8s** — Docker Compose → minikube → cluster

## Status

🚧 Planning phase — implementation starting soon.
