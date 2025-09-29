# Eclaire Changelog

## [0.3.0] - 2025-09-28
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
