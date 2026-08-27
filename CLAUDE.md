# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this project is

A Next.js App Router playground that compares four rich-text editor libraries side by side, each on its own route: **CKEditor** (`/`), **Editor.js** (`/editor-js`), **Tiptap** (`/tiptap`), and **BlockNote** (`/block-note`). There is no shared editor abstraction — each implementation is independent so the libraries can be evaluated on equal footing.

## Commands

```bash
npm run dev      # start dev server (Turbopack via next dev)
npm run build    # production build
npm run start    # run production build
npm run lint     # eslint (flat config, eslint.config.mjs)
```

There are no tests configured in this repo.

## Architecture

### Client-side-only editor pattern

All four editors are DOM-heavy and cannot SSR, so each follows the same two-file split:

- `app/<editor>/components/<editor>.tsx` (or `app/components/<editor>.tsx` for CKEditor) — the actual editor implementation, marked `"use client"`.
- `app/<editor>/components/client-side-<editor>.tsx` — a thin wrapper that loads the real component via `next/dynamic` with `{ ssr: false }`.

The page (`app/<editor>/page.tsx`, or `app/page.tsx` for CKEditor) imports only the `client-side-*` wrapper, never the editor component directly. When adding a new editor or fixing SSR/hydration issues, keep this split intact.

Tiptap is the exception: it has no `client-side-tiptap.tsx` wrapper. `app/tiptap/components/tiptap.tsx` is marked `"use client"` and imported directly by `app/tiptap/page.tsx` (a server component), relying on client-boundary hydration rather than `next/dynamic`.

Editor.js goes a step further: instead of statically importing plugins, `app/editor-js/components/editor-js.tsx` dynamically `import()`s each Editor.js tool inside a `useEffect` and constructs the `EditorJS` instance imperatively against a `React.useId()`-derived holder element. Third-party Editor.js plugins without types are declared ad hoc in `app/editorjs-plugins.d.ts`.

### Shared upload config

Image/file upload across CKEditor, Tiptap, and BlockNote all POST to the same external endpoint, read from `lib/utils.ts`:

```ts
UPLOAD_URL = process.env.NEXT_PUBLIC_UPLOAD_URL
UPLOAD_TOKEN = process.env.NEXT_PUBLIC_UPLOAD_TOKEN
```

Requests go to `${UPLOAD_URL}/api/upload` with `Authorization: Bearer ${UPLOAD_TOKEN}`. These are set in `.env` (not committed). `lib/utils.ts` also exports the shadcn `cn()` helper (clsx + tailwind-merge).

### UI shell

`app/layout.tsx` renders a global `Header` (`components/layout/header.tsx`) with a `NavigationMenu` linking between the four editor routes, plus a global `Toaster`. Editors use `toast()` (`components/ui/toast.tsx`) to surface upload/paste errors.

### shadcn/Tailwind setup

- shadcn is configured via `components.json`: style `base-nova`, base color `neutral`, icon library `lucide`, no prefix. Generated primitives live under `components/ui/`.
- Tailwind v4 is wired through `@tailwindcss/postcss` (`postcss.config.mjs`); there is no `tailwind.config.*` — Tailwind v4 config lives in `app/globals.css`.
- `next.config.ts` enables `reactCompiler: true` (React Compiler via `babel-plugin-react-compiler`), so avoid manual `useMemo`/`useCallback` micro-optimizations that fight the compiler.

### Path alias

`@/*` maps to the repo root (`tsconfig.json`), matching the shadcn aliases (`@/components`, `@/lib`, `@/components/ui`, `@/hooks`).
