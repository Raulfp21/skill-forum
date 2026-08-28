# Skill Forum

Turn any book, paper, spec or set of notes into a structured **skill**, chat with it and get **answers with references**, discuss topics in a **forum**, and search **journals and research articles** — all from one app.

Inspired by the [book-to-skill](https://github.com/virgiliojr94/book-to-skill) approach: a document is distilled into a skill of small on-demand files (`SKILL.md` index + chapter files + `glossary.md` + `patterns.md` + `cheatsheet.md`) rather than dumped into context.

![stack](https://img.shields.io/badge/stack-Express%2BReact-blue)

## Live demo

Run it now — no install needed: https://3001-d9c9b3c641cbd15d.monkeycode-ai.live

## Features

- **Document → Skill.** Upload a PDF, DOCX, Markdown, HTML or TXT. The server extracts text, detects chapters/sections, and generates a structured skill:
  - `SKILL.md` — overview + chapter index (loaded on demand)
  - `chapters/chNN-*.md` — one file per chapter
  - `glossary.md` — terms with definitions
  - `patterns.md` — rules of thumb / best practices
  - `cheatsheet.md` — numeric facts and key figures
- **Chat with references.** Ask a question. BM25 retrieval finds the most relevant chunks, an answer is generated, and every claim maps to a numbered reference (chapter + section + retrieved passage). Click a reference to inspect the source passage.
- **Compare books.** Select 2+ skills and ask one question across all of them — get a combined explanation or a book-by-book debate, with every claim cited back to its source book, chapter and section.
- **AI vs AI vs AI forum debates.** Create a forum topic where you define 2+ AI agents (each with a name, stance, and optional linked skill). They debate in rounds — grounded in their own linked skills or general knowledge — then a **Final Inference** post synthesizes consensus, divergence, and a conclusion. Three discussion styles: explain, debate, and Socratic.
- **Journal search.** Search OpenAlex and arXiv (no API key required) for scholarly works; copy formatted citations.
- **Forum.** Post a topic, optionally link it to a skill, and discuss with replies.

## Architecture

```
client/            React + Vite single-page app
  vite.config.js   reverse-proxies /api to the backend, allowedHosts for preview
server/
  index.js         Express server (API + static hosting of client/dist)
  lib/
    extract.js     PDF / DOCX / HTML / TXT / MD text extraction
    skillgen.js    deterministic document -> skill distillation
    bm25.js        BM25 retrieval over skill chunks
    mockllm.js     answer generation (mock mode + optional real LLM)
    search.js      OpenAlex / arXiv journal search
    pipeline.js    shared processing pipeline (upload + seed)
  routes/          skills, chat, search, forum REST endpoints
  data/            JSON stores (skills, chat history, forum topics) + chunk index
  skills/          generated skill files (one folder per skill)
  sample/          sample document used by `npm run seed`
```

## Quick start

```bash
# 1. install dependencies
npm install

# 2. seed the sample skill (optional, but recommended to see it working)
npm run seed

# 3. start the backend
npm run dev
# -> http://localhost:3001

# 4. start the frontend dev server (with /api proxy)
npm --workspace client run dev
# -> http://localhost:5173
```

The production-style path is `npm run dev` alone: Express serves the built
`client/dist` bundle at `http://localhost:3001`, so the whole app lives on one port.

## LLM mode (optional)

The app runs fully in **mock mode** with no API key: answers are synthesized from
retrieved chunks and citations, which is enough to demo the retrieval + reference
pipeline. To get fluent LLM answers that use the retrieved context, copy
`.env.example` to `.env` and set your own key:

```
USER_LLM_API_KEY=sk-...
USER_LLM_BASE_URL=https://api.openai.com/v1
USER_LLM_MODEL=gpt-4o-mini
```

The chat then sends only the question plus the retrieved source passages (with
citation markers) to the model. You must provide your own key — the app never
reads anything from the host environment.

## API

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/skills` | Upload a document (multipart `file`) → creates a skill |
| `GET` | `/api/skills` | List skills |
| `GET` | `/api/skills/:id` | Skill detail |
| `GET` | `/api/skills/:id/file?path=SKILL.md` | Raw skill file content |
| `POST` | `/api/chat` | `{ skillId, message }` → answer with `refs[]` |
| `POST` | `/api/chat/compare` | `{ skillIds[], message, mode }` → cross-book explanation or debate with `refs[]` |
| `GET` | `/api/chat/:skillId` | Chat history |
| `GET` | `/api/search?q=...&source=openalex,arxiv` | Journal search |
| `POST` | `/api/forum/debate` | `{ title, question, agents[], style, rounds }` → AI agent debate topic with Final Inference |
| `GET` | `/api/forum` · `POST /api/forum` · `POST /api/forum/:id/posts` | Forum |

## Ideas to improve next

- Dense + hybrid retrieval (embeddings) and cross-encoder reranking
- External paper citations inside debate arguments (OpenAlex/arXiv)
- Upload scanned PDFs (OCR step) and EPUB/MOBI
- Citation exporter (BibTeX) from both chat references and journal search
- User accounts and per-user skill libraries
- Forum: skill-triggered auto-answers using the linked skill's retrieval

## License

MIT — this tool ships no document content; you bring your own files and process them locally.
