# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Setup (first time)
corepack enable
pnpm setup:dev

# Development (runs frontend and backend concurrently)
pnpm dev

# Run individual services
pnpm dev:backend           # Backend only (port 3001)
pnpm dev:frontend          # Frontend only (port 3000)

# Build
pnpm build                 # Build all packages

# Type checking
pnpm typecheck             # All packages
pnpm typecheck:backend     # Backend only
pnpm typecheck:frontend    # Frontend only
```

## Testing

```bash
# Unit tests
pnpm test                  # Run all unit tests
pnpm test:unit             # Same as above

# Integration tests (require running database)
pnpm test:integration:api  # API integration tests

# Run specific test suites (in apps/backend)
cd apps/backend
pnpm test:tasks            # All task tests
pnpm test:tasks:crud       # Task CRUD operations
pnpm test:bookmarks        # Bookmark tests
pnpm test:documents        # Document tests
pnpm test:ai-conversations # AI conversation tests

# Watch mode
pnpm test:watch            # Unit tests in watch mode
```

## Linting & Formatting

Uses Biome and oxlint (not ESLint/Prettier).

```bash
pnpm lint                  # Run all linters (Biome + oxlint)
pnpm lint:biome            # Biome only
pnpm lint:oxlint           # Oxlint only
pnpm format                # Format all files
pnpm check                 # Run Biome check (lint + format)
pnpm fix                   # Auto-fix Biome issues
```

Biome config: double quotes, 2-space indentation, 80 char line width.

## Architecture Overview

### Monorepo Structure

- **apps/backend** - Hono API server (Node.js)
- **apps/frontend** - Vite + React 19 + TanStack Router
- **packages/** - Shared libraries:
  - `@eclaire/core` - ID generation, encryption, types, utilities
  - `@eclaire/db` - Drizzle ORM database abstraction (Postgres/SQLite)
  - `@eclaire/ai` - Multi-provider AI client (OpenAI, Anthropic, local LLMs)
  - `@eclaire/queue` - Job queue abstraction (BullMQ or database-backed)
  - `@eclaire/logger` - Pino-based structured logging
  - `@eclaire/storage` - File storage abstraction (local, S3, memory)
- **tools/admin-cli** - CLI administration utilities
- **config/ai/** - AI provider and model configurations

### Backend Pattern (apps/backend/src)

```
routes/         → API route handlers (parse request, call service)
lib/services/   → Business logic layer
lib/agent/      → AI agent tools and execution
workers/jobs/   → Background job processors
schemas/        → Zod validation schemas
```

Routes → Services → Database (via Drizzle ORM)

### Frontend Pattern (apps/frontend/src)

- File-based routing with TanStack Router
- `routes/_authenticated/` - Protected pages (auth guard)
- `routes/auth/` - Login/signup pages
- `lib/frontend-api.ts` - API fetch helpers
- `lib/streaming-client.ts` - SSE streaming for AI responses
- Data fetching with TanStack React Query

### Database

- **ORM**: Drizzle with separate schemas for Postgres and SQLite
- **Schemas**: `packages/db/src/schema/postgres.ts` and `sqlite.ts`
- **Migrations**: `pnpm --filter @eclaire/db db:migrate`

### Background Jobs

Workers in `apps/backend/src/workers/jobs/`:
- `bookmarkProcessor.ts` - Web scraping, content extraction
- `documentProcessor.ts` - PDF/doc processing via Docling
- `imageProcessor.ts` - EXIF extraction, thumbnails
- `noteProcessor.ts` - Note processing
- `taskProcessor.ts` / `taskExecutionProcessor.ts` - Task automation

### AI Integration

Configuration in `config/ai/`:
- `providers.json` - Provider endpoints
- `models.json` - Model capabilities
- `selection.json` - Active models for backend/workers

Initialize with `initAI()`, call with `callAI()` or `callAIStream()`.

## Key Technologies

- **Backend**: Hono (web framework), Better Auth (authentication), Zod (validation)
- **Frontend**: React 19, TanStack Router, TanStack Query, Radix UI, Tailwind CSS
- **Database**: Drizzle ORM, PostgreSQL or SQLite
- **AI**: OpenAI-compatible API (llama.cpp, Ollama, MLX, vLLM, etc.)
- **Queue**: BullMQ (Redis) or database-backed queue
