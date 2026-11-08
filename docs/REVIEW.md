# Eclaire v0.7 review

**Status:** Review of `main` @ `8cd0fda`
**Date:** 2026-11-07
**Companion:** [PRD.md](./PRD.md), the requirements for the rebuild

This document records what Eclaire is today, how it is built, what works, and what to leave behind. It is the evidence base for the rebuild PRD.

**Scope.** About 257k lines of TypeScript: 3 apps (backend, frontend, desktop), 9 packages (`ai`, `api-types`, `audio`, `channels/*`, `core`, `db`, `logger`, `queue`, `storage`) and the admin CLI.

**Method.** Six parallel read-only reviews, one per area:

1. Data model, storage and search
2. Processing pipeline, queue and workers
3. AI agent harness
4. Channels, voice and realtime
5. API, auth, deployment and CLI
6. Frontend

**Confidence.** Unless marked *(inferred)*, every finding came from reading code. Almost nothing was run. Only the auth bypass in §4.1 was re-checked independently, against the installed `@hono/node-server`. Treat the bug list in §4 as high-signal leads to confirm, not a test report.

---

## 1. What the product is today

Eclaire is a self-hosted "AI assistant for your data". It has two halves that grew side by side.

**The data half**

- **Content types.** Six: notes, bookmarks, documents, photos, media (audio/video) and tasks.
- **Shared item metadata.** Every content item can be tagged, pinned, flagged (5 colours), given a due date, and accepted or rejected as "pending review".
- **Capture.** Upload anything to `/api/all` and it is auto-classified by MIME type or URL.
- **Processing.** Each type has its own background pipeline that produces derived artifacts.

| Type | Derived artifacts |
|---|---|
| Bookmarks | Readability text, screenshots, PDF, favicon. GitHub, Reddit and X get special handling. |
| Documents | Docling or native extraction, PDF rendition, thumbnails. |
| Photos | HEIC→JPG conversion, thumbnail, EXIF and geodata, vision classification that branches into OCR and other analyses. |
| Media | yt-dlp import, ffprobe metadata, waveform, transcript (captions → subtitles → STT). |
| Notes, tasks | AI tagging. |

- **Search.** Postgres `tsvector` full-text search. SQLite falls back to `LIKE`. There is no semantic search.
- **Cross-type views.** All, Pending, Due Now, Pinned, Flagged, Inbox, History, Processing.

**The agent half**

- **Model providers.** OpenAI-compatible (llama.cpp, vLLM, Ollama, LM Studio, OpenRouter), Anthropic, MLX, and CLI harnesses (Claude Code, Codex, OpenCode) run as "providers".
- **Model roles.** `backend` is the chat model; `workers` is the processing model.
- **Agent loop.** A custom loop (`RuntimeAgent`) with about 40 in-process tools: find, get, create, update and delete per type, plus notifications, web browsing, Chrome control, admin and audio.
- **Agent controls.** Per-tool approval, skills (SKILL.md), and an MCP **client**.
- **Agents.** Custom agents (prompt, tools, skills, model) are *actors* with attribution.
- **Tasks as delegated work.** Tasks can be delegated to agents (modes: manual, assist, handle), scheduled by cron or one-time date, and pass through a review gate. Every run is recorded as an occurrence.
- **Surfaces.** Web chat (streaming, thinking, tool timeline, approvals, "chat about this item"), CLI chat (Ink TUI), Telegram, Discord and Slack bots, and push-to-talk voice (streaming STT, streaming TTS playback).
- **Voice providers.** mlx-audio, oMLX, whisper.cpp, pocket-tts and ElevenLabs.

**Platform**

- **Stack.** Hono, Better Auth, Drizzle (Postgres, PGlite or SQLite), and a DB-backed job queue.
- **Topology.** `SERVICE_ROLE=all|api|worker`.
- **Admin tooling.** An onboarding wizard (web and CLI share one state machine), an admin CLI shipped inside the image, an Electron shell, and a version-gated upgrade check.
- **Identity and permissions.** An actor/grant/credential model with roughly 30 scopes and peppered-HMAC API keys.

## 2. How it is built

| Area | As built | Main problem |
|---|---|---|
| Data model | One table per type, one tag join table per type, and a 1–2k-line service file per type. Postgres and SQLite schemas (~1.8k lines each) are kept in sync by hand. | Each cross-cutting feature is re-implemented per type. Adding a type touches about 15 backend places and about 17 frontend unions. |
| Artifacts | Per-type `*StorageId` columns; storage keys `{user}/{type}/{id}/{file}`. | Workers write files that have no column (docling.json, extracted.json…). Nothing records which processor, model or prompt produced them. |
| Search | Weighted `tsvector` plus `plainto_tsquery('english')` on Postgres; unindexed `LIKE` on SQLite. | All query words must match, a single language, no semantic search, and pin/flag/review can't be filtered in SQL. |
| Processing | `packages/queue` (good: SKIP LOCKED, fencing, idempotency keys, stage events). On top of it, a 500–1,500-line imperative processor per type. | Stages are only labels. You can't re-run one stage or cache it, and the pipelines can't be extended. |
| Agent runtime | `packages/ai`: hand-written provider adapters that transcode everything into OpenAI SSE, plus a custom loop. The backend owns tools and prompts. | Two orchestration paths (sessions vs prompt-service), two agent loops (one legacy), a bespoke stream protocol, and execution state held in memory. |
| Realtime | One SSE stream per tab for processing, task and session events; a per-request POST-SSE for agent tokens; a WebSocket for STT only; REST for approvals. | No replay or resume, and you can't re-attach to a running agent. Split mode uses one Postgres connection per SSE client. |
| Channels | Clean `ChannelAdapter` interface with dependency injection; 500–850 lines of bot-manager code per platform. | No sender identity check, no inbound media capture, session state in memory, approvals impossible. |
| API | About 190 handlers, wrapped in `withAuth`. Scopes are *inferred from URL prefix*. OpenAPI is generated offline and only partly. | Inconsistent verbs, errors and pagination. The spec isn't served, and the client is handwritten over `any`. |
| Frontend | React 19, TanStack Router and Query, shadcn. `createCrudHooks` and list/detail primitives. | Per-entity pages and items are still duplicated, the type list is hard-coded about 17 times, and a 615-line layout god-component. Offline is shell only. |
| Deploy | One container: API, workers, LibreOffice, Chromium, Poppler, libheif. Plus Postgres and Docling. | Multi-GB image. `ffmpeg` and `yt-dlp` are missing from the image, and `imagemagick`, `graphicsmagick` and `ghostscript` are installed but unused. Split mode is functionally incomplete. |
| CLI | About 37 commands write the **DB directly** with copied crypto helpers. The rest use HTTP via the localhost bypass. | Two sources of business logic, and admin operations that skip validation and audit. |
| Tests | Unit tests in CI. About 45 integration suites are *not* in CI, and there is one e2e spec. | Nothing tests deployment-mode parity, security invariants or upgrades. |

## 3. Scorecard

| Area | Keep the concept | Rebuild the implementation |
|---|---|---|
| Unified capture plus auto-classification | ✅ | Registry-driven classification |
| Originals plus derived artifacts | ✅ | Generic artifacts table with provenance |
| Shared triage metadata (tags, pin, flag, due, review) | ✅ | One item model; suggestions instead of overwrites |
| Queue core (`packages/queue`) | ✅ (design) | Wire it fully: sweeper, DLQ, cancellation, pools |
| Multi-stage jobs with live progress | ✅ | A DAG of idempotent, cacheable processors |
| Actor/principal/grant model | ✅ | Apply it to agents and browser sessions; declarative policy |
| Tasks as human↔agent handoff (assist, handle, review) | ✅ | Unified triggers and automations; durable runs |
| Tool definitions (schema, access level, approval, UI details) | ✅ | One registry, also exposed as an MCP server |
| SKILL.md skills, MCP client | ✅ | Ship them through plugins |
| Model registry with capabilities and roles | ✅ | Build on an established SDK; keep provider-native features |
| Channel adapter DI, streaming message editing | ✅ | Identity links, capture, approvals, persisted mapping |
| Local-first voice providers | ✅ | Real duplex voice sessions |
| Onboarding state machine shared by web and CLI | ✅ | Setup token instead of first-registrant-wins |
| Version-gated upgrades | ✅ | Plus automatic pre-migration backup and an open export format |
| Search | ⚠️ | Hybrid lexical plus vector, chunk-level, same behaviour on every engine |
| Offline / PWA | ❌ (absent) | Change feed plus local store |
| Security posture | ❌ | See §4.1 |

## 4. Findings

### 4.1 Critical: security

1. **Unauthenticated requests are logged in as the first user in the default Docker deployment.**
   - **The code.** `apps/backend/src/lib/auth-utils.ts:155-190` trusts "localhost" when `!isProduction || ECLAIRE_RUNTIME === "container"`. It reads the client IP from `x-forwarded-for`, then `x-real-ip`, then `c.env.ip`.
   - **Why it fails.** Under `@hono/node-server`, `c.env` is `{incoming, outgoing}`, so `ip` is always undefined. The code treats an undefined IP as localhost.
   - **Effect.** The shipped `compose.yaml` sets `ECLAIRE_RUNTIME: container`. Any request without credentials and without an `X-Forwarded-For` header (or with `X-Forwarded-For: 127.0.0.1`) is authenticated as `users.findFirst()` with scopes `*`. *Re-verified independently.*
   - **Status.** This affects anyone running v0.7 today, independent of the rebuild. **Fix it now.**
2. **First registrant becomes instance admin, and registration is on by default.** An exposed fresh instance can be taken over by whoever registers first.
3. **Channel bots never check the sender.**
   - Telegram never compares `ctx.from.id` with the configured chat.
   - Discord and Slack treat every member of a channel as the owner.
   - No caller scopes are passed, so channel callers get full access.
4. **Missing basics.**
   - No rate limiting, CSRF tokens, security headers, 2FA, email verification or password reset.
   - The SSE stream sets `Access-Control-Allow-Origin: *`.
   - `docs/architecture.md` claims a rate-limiting and security middleware that does not exist.
5. **No SSRF guard on bookmark fetching**, through either lightweight fetch or the headless browser. Only media direct-download checks for private IPs.
6. **Privacy leaks.**
   - Full STT transcripts are logged at info level.
   - Deleted notes keep their full content in history `beforeData`.

### 4.2 Correctness bugs found by reading code (most not executed)

**Data and search**

- `/api/all` pagination is broken (`services/all.ts:540-640`):
  - The cursor is never pushed into the per-type queries.
  - The cursor item is duplicated on the next page.
  - When the cursor isn't found, page 1 is returned again.
  - Pin, flag and review filters are applied after the limit is taken.
- SQLite cursor pagination on date sort compares ISO text against integer milliseconds, so page 2 repeats page 1 (confirmed with sqlite3).
- `purgeUserData` ("delete all my data") skips **media** rows. Dashboard stats and due items also ignore media.
- `reviewStatus` means two things. Content uses pending/accepted/rejected; tasks use none/pending/approved/changes_requested. The shared `/review` route validates the content values but is also mounted on tasks.
- `findPopularTags` calls `db.execute` and spreads the result. It likely breaks on SQLite and PGlite.
- AI processing **replaces user tags** and overwrites user-edited titles and descriptions (`notes.ts:959`, `documents.ts:901`, `photos.ts`).

**Processing**

- The scheduler runs only in `SERVICE_ROLE=all`. Remote workers lack the media, task-occurrence, schedule-tick and overdue workers. Remote workers have no artifact processor *(inferred: results are never written in split mode)*.
- `onJobFail` fires on retryable errors and rate-limit reschedules, so entities flash to `failed`.
- An entity is marked `completed` when any intermediate stage reports artifacts.
- Media reprocess returns "Unknown asset type" (`processing-status.ts:997-1030`).
- Retry deletes the job row even while a worker is running it.
- Jobs that crash on their last attempt stay `processing` forever because there is no sweeper. There is also no per-job timeout and concurrency is hard-coded to 1, so one hung handler blocks its queue.
- Domain rate-limiter stale cleanup passes the job id as the asset id, so it never matches anything.
- Agent task runs are never retried. A crashed `running` occurrence is stuck. The `Promise.race` timeout doesn't abort the underlying run.
- Recurring tasks in `handle` mode likely stop after their first run *(inferred)*.
- The text→PDF HTML escape is a no-op (`documentProcessor.ts:1176`).
- `WORKER_CONCURRENCY` is parsed but never applied.

**Agent harness**

- Conversation history loads the **oldest** 100 messages in ascending order, so long threads lose their recent context. There is no compaction.
- Abort doesn't pass the signal to the runtime, so the LLM and tools keep running and the result is saved anyway *(inferred)*.
- Approval-gated tools always fail from channels, voice and scheduled runs because no approval callback is wired.
- Scheduled runs pass `taskDescription`, which the context schema drops, and don't set `backgroundTaskExecution`.
- Attaching any asset to a chat disables all tools (`includeTools = !hasAssets || isBackgroundTask`).
- CLI-harness providers receive only the last user message: no system prompt, no history, and `--resume` is never used.
- Images in tool results (e.g. Chrome screenshots) are stripped before reaching the model.
- `maxTokens: 2000` is hard-coded for all agent calls, which is too low for reasoning models.

**Channels and voice**

- Telegram silently drops photos and documents.
- Discord passes expiring CDN URLs to the agent as text.
- Voice notes are not saved as items.
- Raw markdown is sent to TTS and to Telegram without a parse mode.
- `isAudioAvailable()` is always true because mlx-audio has a default URL.
- Discord voice-channel playback and listening are dead code.

**Frontend**

- Media is missing from `AssetReference`, the chat-context union, the SSE `AssetType`, and the `AllItemsList` update/delete switches.
- `(window as any).openAssistantWithAssets` is assigned during render.
- The PWA install prompt promises offline use that doesn't exist.

**Docs and README drift**

- The docs claim "OpenAI-compatible REST endpoints" (none exist), "Database queue or Redis" (Redis was removed), "bot pooling" (Telegram stops a reused token instead), a served OpenAPI spec (not served), and rate limiting (absent).
- S3 storage throws "not yet implemented".

### 4.3 Structural themes (the real reasons to rebuild)

1. **No type registry.**
   - *Symptom:* every content type is hand-wired across the DB, services, artifact switches, purge, stats, tools, routes and frontend unions.
   - *Proof:* the newest type, **media**, is missing in at least 10 of those places.
2. **Pipelines are code, not data.** Processors can't be added, re-run individually, cached, versioned, or configured per user.
3. **The data is locked inside the process.** The well-designed tool layer is only reachable by Eclaire's own loop. There is no MCP server, no outbound events or webhooks, no change feed and no generated client. External harnesses are hosted *inside* Eclaire and cut off from the data, the opposite of what users want.
4. **State lives in memory.** Running agent executions, approval resolvers, channel sessions, rate limiters and SSE fan-out are all in process. This is the root cause of split-mode breakage, lost approvals, and the inability to re-attach.
5. **Bespoke protocols everywhere.** These include an OpenAI-SSE-as-internal-format, a custom stream events protocol, custom realtime, and scope-by-URL-prefix. Each is a maintenance cost and an interop barrier.
6. **Dual-dialect database.** Two schemas, two migration sets and capability flags, and features silently degrade on SQLite (search, pagination).
7. **Deployment-mode drift.** `all`, `api` and `worker` × three DB engines is a matrix that is not tested, and it already diverges.
8. **Provenance is missing.** Nothing distinguishes AI-generated values from user values. History mixes the change log, security audit and prompt log, with inconsistent snapshots.
9. **Platform churn.** Next.js→Vite, CJS→ESM, Redis→DB queue, Biome→oxlint, JSON config→DB, sub-tasks added then removed. The 0.6 and 0.7 releases each declared "no upgrade path". The rebuild should pick boring, durable foundations and standard protocols so the next two years are spent on product, not on re-platforming.

## 5. Product evolution (from CHANGELOG and git)

- **0.1–0.2:** Internal tool. Next.js, Redis/BullMQ, PM2, PWA share target, Reddit/GitHub enrichment.
- **0.3:** Open-sourced. Share target **removed**.
- **0.4:** MLX and LM Studio.
- **0.5:** pnpm, Node 24.
- **0.6** (breaking): Vite + TanStack, ESM, single container (`SERVICE_ROLE`), SQLite/PGlite, DB queue replaces Redis, admin CLI, auto-upgrade.
- **0.7** (unreleased, breaking): A pivot to an **agent platform over personal data**: actors and grants, custom agents, skills, MCP, approvals, traces, CLI-harness providers, onboarding, Discord/Slack and voice, the media type, a tasks redesign (series, runs, review gates), FTS with trigram indexes, Electron, X bookmark sync.

The direction is clear and correct: personal data substrate + agent harness. The rebuild should make that the founding architecture instead of a retrofit.
