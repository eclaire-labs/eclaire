# Eclaire Changelog

## [0.6.4] - 2026-02-24

### Maintenance

- **deps**: upgrade patch dependencies across all workspaces
- **deps**: notable upgrades include better-auth 1.4.19, hono 4.12.2, TanStack Router 1.162.8, tailwindcss 4.2.1, pnpm 10.30.2

---

## [0.6.3] - 2026-02-22

### Maintenance

- **deps**: upgrade patch and minor dependencies across all workspaces
- **deps**: notable upgrades include biome 2.4.4, bullmq 5.70.1, pg 8.18.0, pino 10.3.1, playwright 1.58.2, react 19.2.4, TanStack Router 1.162.4, tailwindcss 4.2.0, vite 7.3.1, vitest 4.0.18

---

## [0.6.2] - 2026-02-22

### Security

- **deps**: upgrade axios 1.13.2 → 1.13.5 for GHSA-43fc-jf86-j433 (DoS via \_\_proto\_\_ in mergeConfig)
- **backend**: upgrade hono 4.11.4 → 4.12.1 for multiple CVEs (XSS, cache bypass, IP spoofing, timing attack)
- **deps**: upgrade node-gyp 12.1.0 → 12.2.0 and refresh transitive deps (tar, minimatch, ajv, qs, brace-expansion)

---

## [0.6.1] - 2026-01-13

### Security

- **backend**: upgrade hono to 4.11.4 for CVE-2026-22817 (JWT Algorithm Confusion)

---

## [0.6.0] - 2026-01-07

### Highlights

- **Unified deployment**: frontend + backend + workers can run in a single container
- **Simplified Self-Hosting**  - new one-command `setup.sh` flow, plus a streamlined `compose.yaml`
- **Better AI Support**  - New vision models, llama.cpp router, expanded provider support
- **Modern Frontend**  - Migrated from Next.js to Vite + TanStack Router
- **New Admin CLI**  - Manage your instance from the command line

### Features

- **Unified Deployment**: Single container can serve as backend, workers, or both via `SERVICE_ROLE` environment variable
- **SQLite Support**: Full SQLite database support alongside Postgres with comprehensive parity tests
- **Database Queue Mode**: Use Postgres or SQLite for job processing instead of Redis/BullMQ
- **In-Memory Notifications**: Single-process deployments no longer require Redis
- **Admin CLI**: New `admin-cli` integrated into Docker for instance management
- **Auto-Upgrade System**: Database migrations run automatically at startup
- **Qwen3-VL-8B**: Added support for Qwen3-VL-8B vision model
- **llama.cpp Router**: Support for llama-server's new router endpoint
- **Request ID Tracing**: Better observability and debugging across distributed components
- **Version-Prefixed Encryption**: Enables future key rotation support

### Improvements

- **Frontend**: Migrated from Next.js to Vite with TanStack Router for faster builds and modern routing
- **ES Modules**: Complete migration from CommonJS to ES modules
- **Tailwind CSS v4**: Upgraded to latest Tailwind with tw-animate-css support
- **Transaction Support**: Read-Modify-Write for Postgres, mutex serialization for SQLite
- **Services Architecture**: Thin routes pattern with extracted services layer
- **Modular Packages**: New @eclaire/ai, @eclaire/storage, @eclaire/queue packages
- **AI Tool Calling**: More robust native tool calling support
- **AI Providers**: Improved support for llama.cpp, MLX-LM, MLX-VLM, and LM Studio backends
- **Dependency Upgrades**: Vite 7, Vitest 4, Playwright 1.57, Pino 10, Recharts 3, Better Auth 1.4.5

### Bug Fixes

- User queue jobs now deleted when account is deleted
- Fixed AI response truncation/repetition detection with improved JSON parsing
- SQLite case-insensitive sorting for text columns
- Docker layer caching optimized for faster builds
- Queue callback race conditions resolved with timeout safety guards
- Route detail views render correctly
- Image URL fallback uses thumbnailUrl consistently
- Auth session tests include Origin header for CSRF validation
- Sharp/native dependency handling with SHARP_IGNORE_GLOBAL_LIBVIPS

### Breaking Changes

- **TaskStatus**: Removed `cancelled` status from enum
- **SERVICE_ROLE**: New environment variable for deployment mode configuration
- **Data Directories**: Changed from `data/db` to `data/postgres`, `data/pglite`, `data/sqlite`
- **SQLITE_DB_PATH**: Renamed from `SQLITE_DATA_DIR`
- **Environment**: Simplified to single `.env` file configuration
- **Admin CLI**: `model-cli` replaced with `admin-cli`
- **Build Script**: `build.sh` now defaults to dev mode (use `--prod` for production)
- **Production Port**: Standardized to port 3000

### Migration from v0.5.x

**There is no automated upgrade path from v0.5.x to v0.6.0.** Due to significant architectural changes, we recommend setting up a fresh v0.6.0 instance and transferring your data from your previous installation.

If you need help migrating, please [open an issue](https://github.com/eclaire-labs/eclaire/issues) or reach out to us  - we're happy to assist.

### Infrastructure

- All dependencies pinned to exact versions for reproducible builds
- Root biome config for consistent formatting/linting
- Restructured tests directory (`__tests__` → `tests`)
- TypeScript config standardized (typecheck includes tests, build excludes)
- ioredis pinned to 5.8.2 for BullMQ compatibility

### Documentation

- AI Model Configuration guide with Qwen3-VL-8B examples
- First login instructions added to README
- Clarified WORKER_AI_LOCAL_PROVIDER_URL documentation

---

## [0.5.2] - 2025-12-03

### Security

- **frontend**: upgrade Next.js to 15.5.7 for CVE-2025-55182

---

## [0.5.1] - 2025-11-13

### Features

- **build**: configure pnpm workspace for Docker deployment with pnpm deploy

### Bug Fixes

- **docker**: migrate to pnpm deploy for proper dependency resolution in containers
- **frontend**: invalidate asset list on processing status to show spinner

### CI/CD

- **dx**: add --dev flag to build script and update contributor docs

---

## [0.5.0] - 2025-11-11

### ⚠️ Migration Notes

This release includes significant tooling changes:

- **Node.js Version**: Upgraded requirement from v22 to v24 LTS
  - Ensure you're running Node.js v24.x

- **Package Manager**: Migrated from npm to pnpm
  - Enable corepack (one-time setup): `corepack enable`
  - Delete `node_modules` folders: `rm -rf node_modules apps/*/node_modules tools/*/node_modules`
  - Install dependencies: `pnpm install`

### CI/CD

- **deps**: migrate to pnpm and update package dependencies
- **deps**: upgrade Node.js requirement from v22 to v24 LTS
- **deps**: change Node.js engine from >=24.0.0 to ^24.0.0

### Bug Fixes

- **workers**: eliminate macOS keychain popup by using non-persistent browser contexts
- **workers**: add null check for browser context in bookmark processor
- **db**: correct key length in seed script
- **db**: complete key length correction in seed script
- **docker**: use monorepo root as build context for pnpm workspace compatibility
- **ci**: use repository root as Docker build context in GitHub Actions

---

## [0.4.1] - 2025-10-30
### Security
- **deps**: bumped Hono to address security vulnerabilities (GHSA-m732-5p4w-x69g, GHSA-q7jf-gf43-6x6p)
  - Upgraded to latest safe version to resolve Improper Authorization vulnerability (CVE-2025-62610)
  - Fixed Vary Header Injection leading to potential CORS Bypass

### Bug Fixes
- **ai**: use json_schema { name, schema } envelope to align with OpenAI structured outputs

---

## [0.4.0] - 2025-10-14
### Features
- **ai**: Apple MLX integration with native support for Apple Silicon
  - **mlx-lm**: text inference using MLX
  - **mlx-vlm**: vision model support with multimodal capabilities using MLX
- **ai**: LM Studio integration for local model inference
- **model-cli**: enhanced import workflow with provider selection
  - Interactive provider selection (MLX-LM, MLX-VLM, LM Studio, Ollama, LlamaCpp, and more)
  - Automatic vision capability detection from model metadata
  - Smart warnings for incompatible provider/model combinations
  - Improved user experience with context-aware prompts

### Bug Fixes
- **config**: use 127.0.0.1 instead of localhost for service URLs to improve compatibility
- **model-cli**: display modelFullName instead of name in list command

### Documentation
- **readme**: added upgrade section with instructions for updating between versions

### CI/CD
- **docker**: bumped default image tags to 0.4
- **workflows**: explicit semver values for Docker tags

---

## [0.3.1] - 2025-10-08
### Features
- **ci/cd**: official GHCR image publishing system with Github Actions

### CI/CD
- **workflows**: overhauled CI/CD workflows and Docker build system
- **automation**: bootstrap GitHub Actions UI on main branch

### Security
- **deps**: upgraded axios, hono, next.js to resolve security advisories
- **deps**: bumped axios in tools/models-cli to address security advisory

### Refactoring
- **deps**: migrated to zod v4 and removed zod-openapi integration
- **deps**: removed unused @hono/zod-validator dependency
- **deps**: upgraded safe dependencies across frontend, backend, and workers

### Documentation
- **readme**: added demo video
- **readme**: added comprehensive Quick Start guide for running official Docker images
- **readme**: restructured setup options (Quick Start, Development, Building Docker Locally)

---

## [0.3.0] - 2025-09-29
### Features
- **repo**: publish core application (backend, frontend, workers) to a public repository
- **ui**: new logo and refreshed theme with light/dark support
- **docs**: landing page, high-level architecture overview, updated README with quick start
- **tooling**: setup scripts for local development and maintenance
- **security**: signed release tags / verified commits support

### Refactoring
- **repo**: standardized naming and layout for public distribution
- **config**: aligned package metadata and repository information
- **deps**: locked dependency versions for reproducible builds

### Bug Fixes
- **ui**: responsive layout tweaks; hover state fixes; thumbnail edge cases
- **processing**: improved reliability of background jobs and streaming updates
- **content**: fixed malformed character extraction in certain inputs
- **docs**: improved typography and contrast

### Styling
- **ui**: dashboard polish; asset list counts and filters; detail view status links

### Documentation
- **api**: link API docs to GitHub repository
- **contrib**: contribution guide and issue/PR templates
- **security**: clarified vulnerability reporting process in `SECURITY.md`

### Security
- **defaults**: safer API key handling and configuration defaults

### Maintenance
- **integrations**: disabled non-essential third-party APIs by default
- **cleanup**: removed legacy share-target functionality

---

## Prior internal releases (summary)

### [0.2.3] - 2025-08-17
#### Features
- **ui**: dashboard redesign; asset list counts and filters; job status links from asset details
- **ai**: saved AI request/response traces
- **pwa**: Android support
#### Bug Fixes
- **processing**: fixed pending job execution
- **content**: resolved malformed character extraction
#### Infrastructure & Reliability
- **workers**: reliability improvements; replaced Overmind with PM2

### [0.2.2] - 2025-08-12
#### Features
- **assets**: link related content types
- **assistant**: create notes; execute tasks with progress tracking
- **ui**: avatars for users and AI; in-app changelog page; various mobile/PWA improvements
- **social**: Reddit integration (UI and replies)
- **infra**: Docker Compose for full deployment
#### Bug Fixes
- **performance**: optimized Redis connection usage; processing streams; search clear button; thumbnail handling
#### Tools
- **cli**: workers/models/backup CLIs; documentation improvements

### [0.2.1] - 2025-08-05
- Assorted fixes and stability improvements

### [0.2.0] - 2025-07-27
#### Features
- **pwa**: PWA support and share target
- **streaming**: SSE for jobs and assistant
- **data**: React Query integration
- **parsing**: new text/streaming LLM parser; “thinking” support
- **providers**: configuration system and build versioning
#### Testing
- **conversations**: tests; prompt trace replay
#### Bug Fixes
- **previews**: higher-quality document previews
- General fixes and improvements

### [0.1.0] - 2025-06-01
- Initial internal release
