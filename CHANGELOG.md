# Eclaire Changelog

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
