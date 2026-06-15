# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> The codebase and its comments are primarily in Thai; this is an AI-driven novel-writing + roleplay-chat studio with R18 content and a ComfyUI image-generation pipeline.

## Two apps, one repo

| Dir | Stack | Port | Role |
|---|---|---|---|
| `novel/` | **Bun** + Elysia + TypeScript + MongoDB | 3000 | Backend API, AI prompt assembly, image-gen orchestration |
| `novel-next/` | Next.js (App Router) + Bun + Tailwind | 3001 | Frontend (the actual UI); also where chat context is orchestrated |

The frontend **proxies** `/api/*` and `/uploads/*` to the backend (`novel-next/next.config.mjs` rewrites) so the browser stays same-origin. The proxy target `BACKEND_URL` is **baked at build time** (`output: 'standalone'`) — when building the Docker image you must pass `BACKEND_URL` as a build ARG, not just a runtime env.

## Commands

Backend (`cd novel`, requires `MONGODB_URI` in `.env` or it throws on boot):
```bash
bun install
bun run dev                 # bun --hot server.ts → :3000
bun test                    # run all *.test.ts
bun test chat-memory.test.ts        # single file
bun test -t "fts trigram"           # filter by test name
bunx tsc --noEmit           # typecheck (uses tsconfig.json)
```

Frontend (`cd novel-next`):
```bash
bun install
bun run dev                 # next dev → :3001 (run backend on :3000 alongside)
bun run build               # next build (standalone)
bun run lint                # next lint
bunx tsc --noEmit           # typecheck
```

There is no backend lint script and no shared monorepo tooling — each app is installed/run independently. Backend runs on the **Bun runtime, not Node** (uses `bun:sqlite`, `bun:test`); don't assume Node APIs.

Docker stack (MongoDB + backend + frontend, tuned for a 3GB-RAM VPS):
```bash
docker compose up -d --build            # local (build images)
docker compose pull && docker compose up -d   # VPS (pull from GHCR)
```
CI (`.github/workflows/deploy.yml`): push to `main` → build & push images to GHCR → SSH-deploy to VPS. SSH/deploy details are in `SSH.md` and `DEPLOY.md`.

## Architecture (the big picture)

**Persistence + optimistic locking.** MongoDB via `novel/db.ts`. App state, chat sessions, and characters are stored as documents carrying a `rev` counter. Every write must send the `rev` it loaded; the server returns `409 conflict` instead of overwriting if `rev` moved (`state-store.ts`, the `/api/state`, `/api/chat-state`, `/api/chat-session/:id` endpoints). Clients hold `__rev` and reconcile. Don't bypass this — it's what keeps multiple tabs/autosave from clobbering each other.

**LLM provider abstraction.** `novel/server.ts` `callAI()` + `resolveProvider()` support three pluggable providers — `openrouter`, `deepseek` (cloud), and `lmstudio` (local Gemma, OpenAI-compatible, no key). Selection falls back automatically if a key is missing. Local image-gen/LLM run on a host GPU via `host.docker.internal`; the VPS has no GPU, so it uses DeepSeek cloud.

**Prompt assembly (the heart of the app).** `novel/shared-rules.ts` holds the central rules (adult content, anti-meta, R18 lexicon, continuity) that every mode imports and extends:
- `prompts.ts` — **novel mode** (long-form chapter generation).
- `chat-prompt.ts` — **roleplay chat mode** (multi-turn, character agency, relationship dynamics) and **narrator mode**.
Position in the prompt matters: a short persona/lexicon **reminder is injected near the end** of context every turn (recency bias / anti-drift), and the live "current state" section is intentionally ranked above recalled memory and summary.

**Chat context management lives CLIENT-side.** The `/api/chat` endpoint is essentially **stateless** — it receives `history`, `summary`, `lore`, `stateCard`, and `recalled` from the client and just assembles + calls the LLM. The orchestration is in `novel-next/src/components/screens/chat/ChatScreen.tsx`:
- **Rolling summary fold** (`buildMemory`) — keeps the last N raw turns, folds older ones into a prose `summary` (lossy). Separate `buildSecretMemory` for narrator-only "secret" scenes.
- **Structured live-state card** (`state-card.ts`) — model emits `[[state: ...]]` deltas; applied + contradiction-checked deterministically (no extra LLM call).
- **Lorebook** — keyword-activated facts.
- **Hybrid RAG long-term memory** (recent feature, Phase 1) — `novel/chat-memory.ts` (`bun:sqlite` FTS5 trigram + per-scope cosine vector + hybrid `recall`) with `novel/embed.ts` (pluggable OpenAI-compatible embeddings, **degrades to FTS-only** when `EMBED_*` env is unset). The client calls `/api/chat/memory/{backfill,ingest,recall}` and passes `recalled[]` into `sendChat`. Design + limitations: `docs/superpowers/specs/2026-06-16-chat-rag-memory-design.md`.

**Image generation** runs against **ComfyUI on a host GPU** (not in Docker). `novel/image-gen.ts` orchestrates workflows; the many `novel/gen_*.py` scripts are standalone ComfyUI experiments. `novel/ref-tag.ts` does WD14 image→booru-tag extraction (local, uncensored). `novel/card-v2.ts` imports/exports SillyTavern Character Card V2/V3 (JSON embedded in PNG `tEXt` chunks). ComfyUI setup is documented in `comfyui/`.

**Logging.** `novel/logger.ts` writes request/activity/error logs to both a Mongo `app_logs` collection (queryable in-app on the `ailog` screen) and daily JSONL files.

**MCP.** `.mcp.json` at repo root wires `mcp-lmstudio` (read-only LM Studio inspection + AI-call logging) and `blender-mcp`.

## Conventions

- Tests are colocated as `*.test.ts` next to source in `novel/`, run by `bun test`. (The `novel/*.test-*.ts` / `stress-test-*.ts` files are manual model-evaluation harnesses, not unit tests.)
- Frontend follows a strict "one component, edit in one place" structure documented in `novel-next/README.md` (UI kit in `components/ui/`, screens in `components/screens/<screen>/`, theme tokens in `lib/theme.ts`).
- Ground-truth story/character markdown lives in `novel/*.md` and `story/`; model-evaluation notes in `review/`.
- This is an R18 project: when choosing cloud services (e.g. embedding providers) consider ToS — some providers may ban accounts over mature content.

## Mobile-first writing UX

The author reads/writes the novel **on a phone**. Changes to the writing/reading flow must preserve mobile UX — no view jumps, and "เขียนต่อ" (continue writing) must genuinely continue via prefill, not restart.
