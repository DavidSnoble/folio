# Building the PDF Library — A Hands-On Guide

The goal: a Folio screen that lets you upload PDFs, lists what's stored, and opens them in a new tab — with a **swappable** storage backend (Dexie today, OPFS or whatever tomorrow).

This guide is ordered so you learn one thing at a time. TypeScript and React concepts are introduced as you need them, not all up front. Read the **Concepts** section first, then build top-to-bottom. Try to resist copying from this doc — instead, refer back to the tic-tac-toe in `src/App.tsx` for patterns to mimic, and look up anything you don't recognize.

Run `npm run lint` and `npm run build` after each step. Lint errors are a learning tool — read them, don't suppress them.

---

## Concepts primer

You'll meet all of these during the build. Skim once, then come back as needed.

### TypeScript

- **`type X = ...`** vs **`interface X = ...`**. Use `type` for unions/aliases and `interface` for object shapes that might be extended. The tic-tac-toe uses both — see `type Player = 'X' | 'O'` vs the implicit `SquareProps` shape.
- **Union types**: `'X' | 'O' | null`. The discriminant is what makes a discriminated union powerful; you won't need that here, but you'll see simple unions.
- **`as const`** and **`satisfies`**. The tic-tac-toe uses both on `BOARD_ROWS` and `WINNING_LINES`. `as const` freezes the array as a readonly tuple of literals. `satisfies` validates a value matches a type *without widening it*. You'll want this for storage enum-like values.
- **Generics**: `useState<T>()`, `Promise<T>`, `useRef<T>(null)`. The angle brackets are how you tell these helpers what they're working with.
- **Type-only imports**: `import type { Foo } from './bar'`. With `verbatimModuleSyntax: true` (set in `tsconfig.app.json`), you **must** use this for types. Plain `import { Foo }` for a type-only symbol is a build error.
- **`void` / `async`**: an `async` function always returns a `Promise<T>`. If you don't care about the return, the return type is `Promise<void>`.
- **Structural typing**: TS doesn't care about the name, only the shape. That's why an `interface` and a `type` with the same shape are interchangeable in most places. This is also why the swappable-storage trick works.

### React

- **Component = function returning JSX**. Props are the first argument. Name the type with `Props` suffix: `SquareProps`, `BoardProps`. Look at the tic-tac-toe.
- **Lifting state up**: when two siblings need the same data, hoist it to their common parent. The tic-tac-toe does this — `Game` holds `history` and `currentMove` because `Board` only needs the current slice.
- **Hooks** (always call at the top of a component, never inside conditionals/loops):
  - `useState<T>(initial)` — local state. `initial` can be a lazy function `useState(() => expensive())`.
  - `useEffect(() => { ... }, [deps])` — run side effects after render. The deps array is the contract: the effect re-runs when any dep changes.
  - `useRef<T>(initial)` — a mutable box that survives renders without triggering them. Use it for the file input element and for tracking values across renders.
  - `useMemo(() => ..., [deps])` — memoize an expensive computation. Use sparingly; only when you can justify the cost.
  - `useContext(Ctx)` — read a value from a context.
- **Context**: a way to pass a value deeply without threading props. You make a context, a provider, and a custom hook. Three pieces, every time.
- **Strict Mode double-invocation**: in dev, React calls effects **twice** to surface bugs. Any effect you write must be safe to run twice. Mutating IndexedDB twice on mount is fine (idempotent `list()`), but it's something to keep in mind.
- **`react-refresh/only-export-components`**: HMR rule. A file should export either components or non-components, not both. If you put a component and a hook in the same file, lint will complain. We'll see this when we split the storage context.
- **`react-hooks/set-state-in-effect`** (new in React 19's plugin): a stricter rule that flags setState calls in effects. The async-fetch pattern hits a false positive — there's a way to deal with it that you'll learn.

---

## The architecture, in one picture

```
   ┌─────────────────────────────────────────────────────┐
   │  App.tsx                                            │
   │    <StorageProvider>     ← injects the storage      │
   │      <Library />         ← talks ONLY to useStorage │
   │    </StorageProvider>                              │
   └─────────────────────────────────────────────────────┘
              │
              │  useStorage()
              ▼
   ┌─────────────────────────────────────────────────────┐
   │  storage/                                           │
   │    types.ts          ← BlobStorage interface        │
   │    dexieStorage.ts   ← one implementation           │
   │    StorageContext.ts ← the context object           │
   │    StorageProvider.tsx  ← <StorageProvider value>   │
   │    useStorage.ts     ← the consumer hook            │
   └─────────────────────────────────────────────────────┘
```

The **only** thing `App.tsx` knows is `useStorage()`. It has no idea Dexie exists. That's the whole point.

---

## Step 1 — Data model

Open `src/storage/types.ts` (create the directory and file).

Define two things:

- `StoredFile` — the metadata you keep in memory. Look at the tic-tac-toe for the prop-type naming pattern. You'll need at least: an id, the original name, the MIME type, the byte size, and a created-at timestamp. Pick the right types for each (hint: id is a string, size is a number, createdAt should make dates easy to display).
- `BlobStorage` — the interface. Think about which operations the UI will need. The four obvious ones: store, retrieve one, list all, delete. Each method should be `async` and return what the UI actually needs.

**Things to think about:**
- Should `put` take a `Blob` or a `File`? (`File` extends `Blob`; the file input gives you `File`s. The UI never has a naked `Blob`.)
- Should the returned `StoredFile` from `put` be the input or the stored record? (You want the id, so the stored record.)
- What does `get` return if the id doesn't exist? Throw, or return null? (Throwing is simpler; the UI can catch.)

---

## Step 2 — Add Dexie

`npm install dexie`

Read the first ~50 lines of the [Dexie quickstart](https://dexie.org/docs/Tutorial/Getting-started). You don't need to memorize it; you just need to know:
- You define a class extending `Dexie`
- `version(1).stores({...})` declares tables and indexes
- `Table<T, KeyType>` is the type of a table

Now write `src/storage/dexieStorage.ts`. You'll define a class that implements `BlobStorage`. The internal Dexie table will hold records that are `StoredFile & { blob: Blob }` — i.e. metadata plus the actual binary.

**Hints:**
- A Dexie schema string like `'id, name, createdAt'` declares the primary key plus secondary indexes. You only need indexes for things you'll query by. You won't query by `name` or `mimeType` or `size` in this app, so don't index them.
- `crypto.randomUUID()` returns a string. The `crypto` global is available in modern browsers and your TS `lib` already includes it.
- For `list()`, return records in newest-first order. Dexie's `orderBy('createdAt').reverse().toArray()` does exactly that.
- When you return a `StoredFile` from a record that also has a `blob` field, you have to **not** return the blob. The `lib` config has `noUnusedLocals` strict — be careful with destructuring. Either build the object explicitly (`return { id: rec.id, name: rec.name, ... }`) or use rest spread (`const { blob, ...meta } = rec; return meta;` and accept the unused-local).
- `get(id)` should throw if the record doesn't exist. The error message can be whatever you want.

---

## Step 3 — React Context (three files, one rule)

The rule: **one file, one job.** A file that exports a component exports *only* a component. A file that exports a hook exports *only* a hook. The lint rule `react-refresh/only-export-components` will tell you if you break this. The reason: HMR (Fast Refresh) can only hot-reload a file if it knows which exports are components.

You'll create three files:

### `src/storage/StorageContext.ts`

A plain `.ts` file (no JSX). It exports one thing: the context object created with `createContext<BlobStorage | null>(null)`. Why nullable? So that `useStorage` can throw a useful error if you forget the provider.

### `src/storage/StorageProvider.tsx`

A component that takes `children: ReactNode` and an optional `storage?: BlobStorage` prop. If no `storage` is passed, it creates a `new DexieBlobStorage()` once and keeps it stable across renders — that's what `useMemo` is for. The provider renders `<StorageContext.Provider value={value}>{children}</StorageContext.Provider>`.

**Things to think about:**
- `ReactNode` is the broadest "anything renderable" type. It's the right prop type for `children`.
- `useMemo(() => storage ?? new DexieBlobStorage(), [storage])` — the dependency array means "rebuild only if `storage` changes." If the parent never passes `storage`, the Dexie instance is created exactly once.
- This is the **only** place that knows about Dexie. After this step, swapping to OPFS is one line in `App.tsx`.

### `src/storage/useStorage.ts`

The hook. It calls `useContext(StorageContext)` and throws a descriptive error if the result is `null`. Return the non-null value. That's it.

---

## Step 4 — The UI

Replace `src/App.tsx` entirely. Keep the structure familiar — function components, named exports, types at the top.

You'll have two components:

```tsx
export default function App() {
  return (
    <StorageProvider>
      <Library />
    </StorageProvider>
  );
}

function Library() { ... }
```

`App` is the wiring. `Library` is the actual screen.

### `Library` state

You need four pieces of state:

- `files: StoredFile[]` — the list
- `hasLoaded: boolean` — whether the first load has finished (use this for the loading state, not a `loading: boolean` flag — you'll see why in a moment)
- `error: string | null` — the most recent error message
- `busy: boolean` — true while a user-triggered action (upload/delete) is in flight

Plus a ref:
- `inputRef: useRef<HTMLInputElement>(null)` — so you can clear the file input after upload

### `Library` effects

One effect: on mount (and when the storage instance changes), call `storage.list()` and update state.

```tsx
useEffect(() => {
  // list, setFiles, setHasLoaded(true) in .then/.catch/.finally
}, [storage]);
```

**Why `hasLoaded` and not `loading`?** A `loading` flag that you flip to `true` at the start of the effect and `false` at the end has to be touched synchronously inside the effect, which the new React 19 lint rule `react-hooks/set-state-in-effect` will flag. Using `hasLoaded` (only ever set to `true`, after the first load completes) sidesteps the rule entirely. Think about why: what direction does the value flow? `hasLoaded` only ever goes from `false` to `true`, so the initial render's "loading" is derived, not stored.

You'll also see a `// eslint-disable-next-line react-hooks/set-state-in-effect` warning may still fire here because the effect's body indirectly contains setStates. The disable is appropriate; the pattern is correct. Add a one-line comment explaining why, like the example in the final reference below.

### `Library` handlers

Three event handlers, all async:

- **`handleUpload`** — reads `event.target.files` (a `FileList`, *not* an array — look up how to iterate it). For each file, calls `storage.put(file)`. Then refreshes the list. Resets the input value in the `finally` block so the same file can be re-selected.
- **`handleOpen`** — calls `storage.get(id)`, makes an object URL with `URL.createObjectURL(blob)`, opens it in a new tab with `window.open(url, '_blank', 'noopener')`, then schedules `URL.revokeObjectURL(url)` after a delay (the new tab needs time to load it). 30–60 seconds is fine.
- **`handleDelete`** — confirms, calls `storage.delete(id)`, refreshes.

All three should set/clear `busy` and `error` appropriately. The pattern is identical in each: `setBusy(true); try { ... } catch (e) { setError(...) } finally { setBusy(false) }`.

### `Library` JSX

- A `<header>` with `<h1>Library</h1>` and a `<label>` wrapping a hidden `<input type="file" accept="application/pdf" multiple>`.
- An error banner (rendered only if `error` is non-null).
- A list of files. While `!hasLoaded`, show "Loading…". Once loaded, if `files.length === 0` show "No files yet. Add a PDF to get started." Otherwise render a `<ul>`.

The empty-state and loading-state messages are the same visual style. Use a single class (e.g. `library__empty`) for both.

### The "label wraps input" trick

```html
<label class="library__upload">
  <input type="file" hidden />
  <span>Add PDFs</span>
</label>
```

The input is the source of truth for clicks; the label makes the styled `<span>` clickable. This is a common pattern. (If you don't want `display: none` on the input — which can break the file dialog in some browsers — use `position: absolute; opacity: 0` instead. Or just `hidden`; it's been reliable for years.)

---

## Step 5 — Style it

Replace `src/index.css` and `src/App.css`. Keep `index.css` to a global reset (box-sizing, body margin, font). Put everything else in `App.css` with a `library__*` BEM-ish naming convention.

A few things to think about:
- The upload label needs `position: relative` and the input inside it needs `position: absolute; inset: 0; opacity: 0` (or `hidden`) so the whole label is clickable.
- The action buttons should be visually distinct: a normal "Open" and a red-tinted "Delete". Use CSS custom properties for the palette; the tic-tac-toe doesn't have any, so this is a chance to introduce them.
- `text-overflow: ellipsis` on the file name with `white-space: nowrap; overflow: hidden` so long filenames truncate rather than wrap.
- Don't forget `:focus-visible` outlines — accessibility matters.

---

## Verification

After each step:

```sh
npm run lint
npm run build
```

Both should succeed. If lint fails, **read the error** — it's pointing at a concept you may not have internalized yet.

Once everything builds, run `npm run dev` and:
1. Upload a PDF.
2. See it in the list with the right size and a recent timestamp.
3. Click "Open" — the browser's built-in PDF viewer should render it.
4. Click "Delete", confirm, watch it disappear.
5. Reload the page — your file should still be there. (IndexedDB persists.)
6. Open DevTools → Application → IndexedDB → `folio` → `files` and see your blob.

---

## Stretch goals (pick what excites you)

- **Drag and drop**: replace the `<label>` + input with a drop zone. Use the native HTML5 drag events (`onDragOver`, `onDrop`) on a `<div>`. The `DataTransfer.files` is a `FileList`, same as the input.
- **PDF preview in-app**: install `react-pdf` and render the first page inline. You'll need to manage loading state per-file and clean up the document on unmount.
- **EPUB support**: change `accept="application/pdf"` to also allow `application/epub+zip`. The storage layer doesn't care what kind of blob it stores.
- **Swap to OPFS**: implement a second `BlobStorage` (call it `OpfsBlobStorage`) using `navigator.storage.getDirectory()`. Verify it works in Chromium, then make the choice runtime-detected so the app picks the best available backend.
- **Search/filter**: filter the list by filename as the user types. Make `Library` a controlled component with a search input.
- **Pagination / infinite scroll**: for large libraries, `useState` a `page` index and slice the list. (You probably won't need this until you have hundreds of books.)
- **Reading progress**: extend `StoredFile` with `lastReadPage`, `lastReadAt`, etc. Bump the Dexie schema to `version(2)`.
- **Cover thumbnails**: extract the first page of each PDF as an image and store it as a separate blob. Cache aggressively.
- **Real-time reactivity**: when you upload in one tab, the other tab's list should update. Look at Dexie's `liveQuery` (or implement your own BroadcastChannel-based invalidation).

---

## Reference — what the final code looks like

This is the shape, not the code. If you get stuck for more than ~10 minutes, peek at the equivalent in your git history from when I built it the first time. Otherwise, keep going on your own.

- `storage/types.ts`: ~12 lines. Two declarations, both small.
- `storage/dexieStorage.ts`: ~50 lines. A class extending `Dexie`, four async methods.
- `storage/StorageContext.ts`: 3 lines. A single `createContext` call.
- `storage/StorageProvider.tsx`: ~15 lines. `useMemo` + a JSX return.
- `storage/useStorage.ts`: ~10 lines. `useContext` + a null check.
- `App.tsx`: ~120 lines. State, effect, three handlers, JSX. Half of it is JSX.
- `App.css`: ~120 lines. Mostly layout and a small color palette.
- `index.css`: ~20 lines. Reset and CSS variables.

The whole thing should take you under an hour if you've used React before, half a day if it's mostly new. The point isn't the speed — it's that you can explain every line.
