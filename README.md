[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/eclaire-labs-eclaire-badge.png)](https://mseep.ai/app/eclaire-labs-eclaire)

<!-- README.md -->

<p align="center">
  <a href="https://eclaire.co">
    <img src="docs/assets/logo-text.png" alt="Eclaire Logo" width="400" />
  </a>
</p>

<h1 align="center">ECLAIRE</h1>

<h3 align="center"><em>Privacy-focused AI assistant for your data</em></h3>

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/github/license/eclaire-labs/eclaire"></a>
  <a href="https://github.com/eclaire-labs/eclaire/releases"><img alt="Release" src="https://img.shields.io/github/v/release/eclaire-labs/eclaire?sort=semver"></a>
  <a href="https://eclaire.co/docs"><img alt="Docs" src="https://img.shields.io/badge/docs-eclaire.co%2Fdocs-informational"></a>
  <a href="https://youtu.be/JiBnoTmev0w"><img alt="Watch demo" src="https://img.shields.io/badge/Watch%20demo-YouTube-red?logo=youtube"></a>
</p>

<p align="center" id="demo">
  <a href="https://youtu.be/JiBnoTmev0w" target="_blank" rel="noopener">
    <img
      src="https://github.com/eclaire-labs/eclaire/releases/download/media/eclaire-demo-preview.gif"
      alt="Eclaire demo preview (click to watch on YouTube)"
      width="900"
    />
  </a>
  <br/>
  <sub><em>Click to watch on YouTube</em></sub>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#selecting-models">Selecting Models</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#roadmap">Roadmap</a> •
  <a href="#contributing">Contributing</a> •
  <a href="https://eclaire.co/docs">Docs</a> •
  <a href="https://eclaire.co/docs/api">API</a>
</p>

---

## ⚠️ Important Notices

> [!IMPORTANT]  
> **Pre-release / Development Status**  
> Eclaire is currently in pre-release and under active development.  
Expect frequent updates, breaking changes, and evolving APIs/configuration.  
> If you deploy it, please **backup your data regularly** and review release notes carefully before upgrading.

> [!WARNING]  
> **Security Warning**  
> Do **NOT** expose Eclaire directly to the public internet.  
> This project is designed to be self-hosted with privacy and security in mind, but it is **not hardened for direct exposure**.  
>  
> We strongly recommend placing it behind additional security layers such as:  
> - [Tailscale](https://tailscale.com/) or other private networks/VPNs  
> - [Cloudflare Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)  
> - A reverse proxy with authentication

---

## Description

**Eclaire** is a local-first, open-source AI that organizes, answers, and automates across tasks, notes, documents, photos, bookmarks and more.

There are are lot of existing frameworks and libraries enabling various AI capabilities; few deliver a complete product allowing users to get things done. Eclaire assembles proven building blocks into a cohesive, privacy-preserving solution you can run yourself.

With AI gaining rapid adoption, there is a growing need for alternatives to closed ecosystems and hosted models, especially for personal, private, or otherwise sensitive data.

- **Self-hosted** — runs entirely on your hardware with local models and data storage
- **Unified data** — one place where AI can see and connect everything
- **AI-powered** — content understanding, search, classification, OCR, and automation
- **Open source** — transparent, extensible, and community-driven
  
## Features
- **Cross-platform**: macOS, Linux and Windows. 
- **Private by default**: By default all AI models run locally, all data is stored locally.
- **Unified data**: Manage across tasks, notes, documents, photos, bookmarks and more.
- **AI conversations**: chat with context from your content; see sources for answers; supports streaming and thinking tokens.
- **AI tool calling**: The assistant has tools to search data, open content, resolve tasks, add comments, create notes, and more
- **Layered architecture**: frontend, backend, and workers are separate services. Run only the backend for API-only/data-processing use cases. *(See [Architecture](#architecture) section below.)*
- **Full API**: OpenAI-compatible REST endpoints with session tokens or API keys. [API Docs](https://eclaire.co/docs/api)
- **Model backends**: works with llama.cpp, vLLM, mlx-lm/mlx-vlm, LM Studio, Ollama, and more via the standard OpenAI-compatible API. *(See [Selecting Models](#selecting-models).)*
- **Model support**: text and vision models from Qwen, Gemma, DeepSeek, Mistral, Kimi, and others. *(See [Selecting Models](#selecting-models).)*
- **Storage**: all assets (uploaded or generated) live in Postgres or file/object storage.
- **Integrations**: Telegram (more channels coming).
- **Documents**: PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, ODT/ODP/ODS, MD, TXT, RTF, Pages, Numbers, Keynote, HTML, CSV, and more.
- **Photos/Images**: JPG/JPEG, PNG, SVG, WebP, HEIC/HEIF, AVIF, GIF, BMP, TIFF, and more.
- **Tasks**: track user tasks or assign tasks for the AI assistant to complete; the assistant add comments to tasks or write to separate docs.
- **Notes**: plain text or Markdown format. Links to other assets.
- **Bookmarks**: Fetches bookmarks and creates PDF, Readable and LLM friendly versions. Special handling for Github and Reddit APIs and metadata.
- **Organization**: Tags, pin, flag, due dates, etc. across all asset types.
- **Hardware acceleration**: takes advantage of Apple MLX, NVIDIA CUDA, and other platform-specific optimizations.
- **Mobile & PWA**: installable PWA; iOS & Apple Watch via Shortcuts; Android via Tasker/MacroDroid.

## Sample use cases
- Dictate notes using Apple Watch (or other smartwatch).
- Save bookmarks to read later; generate clean “readable” and PDF versions.
- Create readable and PDF versions of websites
- Extract text from photos and document images (OCR).
- Bulk-convert photos from HEIC to JPG.
- Analyze, categorize, and search documents and photos with AI.
- Create LLM-friendly text/Markdown versions of documents and bookmarks.
- Save interesting content (web pages, photos, documents) from phone, tablet, or desktop.
- Ask AI to find or summarize information across your data.
- Schedule automations (e.g., “Every Monday morning, summarize my tasks for the week.”).
- Chat with AI from web, mobile, Telegram, and other channels.
- Process sensitive information (bank, health, etc.) privately on local models.
- De-clutter your desktop by bulk-uploading and letting AI sort and tag.
- Migrate data from Google/Apple and other vendors into an open, self-hosted platform under your control.

## Screenshots

<table>
  <tr>
    <td><a href="docs/images/dashboard-dark-fs8.png"><img src="docs/images/dashboard-dark-fs8.png" alt="Dashboard View" width="400"/></a></td>
    <td><a href="docs/images/photo-ocr-dark-fs8.png"><img src="docs/images/photo-ocr-dark-fs8.png" alt="Photo OCR" width="400"/></a></td>
  </tr>
  <tr>
    <td><a href="docs/images/main-dark-fs8.png"><img src="docs/images/main-dark-fs8.png" alt="Main Dashboard" width="400"/></a></td>
    <td><a href="docs/images/assistant-dark-fs8.png"><img src="docs/images/assistant-dark-fs8.png" alt="AI Assistant" width="400"/></a></td>
  </tr>
</table>


## Installation

> [!IMPORTANT]  
> Eclaire is in pre-release and under active development.  
> Expect breaking changes — backup your data.  
> Do **not** expose it directly to the internet; use a VPN, tunnel, or reverse proxy.

### System Requirements

**Runtime & Tools:**
- **Node.js ≥ 22** (npm ≥ 11.5.1 recommended)
- **Docker Desktop** with **Compose v2**
- **PM2** process manager (`npm i -g pm2`) - used to run dependencies.

**Infrastructure Services:**
- **PostgreSQL ≥ 17.5** (managed via Docker)
- **Redis ≥ 8** (managed via Docker)

**AI/ML Backends:**
- **llama.cpp/llama-server** for local LLM inference ([install guide](https://github.com/ggml-org/llama.cpp))
- **docling-serve** for document processing ([install guide](https://github.com/docling-project/docling-serve))

> [!NOTE]
> We currently run llama-server and docling **bare-metal** (not containerized) for direct GPU access; PM2 supervises these processes.


### Quick Start

Choose the setup path that matches your needs:

#### Option A — Quick Start (Recommended)
**For users who want to run Eclaire quickly using official Docker images**

1. **Run automated setup**
```bash
npm run setup:prod
```
This will:
- Copy configuration files
- Create required directories
- Check system dependencies
- Install npm dependencies (needed for database migrations)
- Start PostgreSQL and Redis
- Initialize the database with essential seed data

The setup will **automatically use official GHCR images** and skip local Docker builds.

2. **Start Eclaire**
```bash
docker compose up
```

Access the application:
- Frontend: http://localhost:3000
- Backend health: curl http://localhost:3001/health


#### Option B — Development (For contributors)

** Additional dependencies required:**
- LibreOffice (soffice for document processing)
- Poppler Utils / pdftocairo (for PDF processing)
- GraphicsMagick or ImageMagick (for image processing)
- Ghostscript (for PDF/PostScript processing)
- libheif (optional, for HEIC/HEIF photo processing)

**macOS:**
```bash
brew install --cask libreoffice
brew install poppler graphicsmagick imagemagick ghostscript libheif
```

**Ubuntu/Debian:**
```bash
sudo apt-get install libreoffice poppler-utils graphicsmagick imagemagick ghostscript libheif-examples
```

1. **Run automated setup**
```
npm run setup:dev
```
This will:
- Check system dependencies (Node.js, Docker, PM2, etc.)
- Copy all environment config files
- Create required data directories
- Install npm dependencies for all apps
- Start dependencies (PostgreSQL, Redis, AI models via PM2)
- Initialize the database with sample data

**Note:** AI models will download automatically on first start (5-10 minutes for large models). You can monitor progress with: `pm2 logs llama_backend --lines 100`

Setup runs in interactive mode by default (asks for confirmation at each step).

2. **Run the dev servers**
```bash
npm run dev
```

Access the application:
- Frontend: http://localhost:3000
- Backend health: curl http://localhost:3001/health


#### Option C — Building Docker Locally (Advanced)
**For users who want to customize and build their own Docker containers**

If you need to modify the application or build custom images:

1. **Setup with build** (if starting fresh):
```bash
npm run setup:prod:build
```
This runs the full setup process, builds Docker containers locally, and generates `docker-compose.local.yml` to reference your local images.

2. **Or build manually** (if already setup):
```bash
./scripts/build.sh
```
This will build the Docker images locally and generate `docker-compose.local.yml` that references your local images.

3. **Run with local images**:
```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up
```

The build script creates `docker-compose.local.yml` that overrides the image references to use your locally-built containers instead of pulling from GHCR.

Access the application:
- Frontend: http://localhost:3000
- Backend health: curl http://localhost:3001/health


### Stopping & Cleanup
- If you started Dev with npm run dev: Press Ctrl+C in the terminal running the dev process.
- If you started with Docker Compose
```
docker compose down
```
- Stop dependencies (Postgre, Redis, etc.)
```
pm2 stop pm2.deps.config.js
```


## Selecting Models
Eclaire is designed to work with various LLM backends and models. By default we picked llama.cpp with Qwen3 14b Q4_K_XL GGUF for AI assistant and Gemma3 4b Q4_K_XL GGUF because that runs well on a typical dev machine (eg a Macbook Pro M1+ with 32GB memory) but you may want to pick something more appropriate. Some notes:

- Support for llama.cpp / llama-server, vLLM, mlx_lm, mlx_vlm, ollama and more.
- Uses the OpenAI-compatible /v1/chat/completions endpoint.
- eclaire-backend expects a text model with decent tool calling / agentic capabilities
- eclaire-workers expects a multi-modal model with support for text + images
- Both eclaire-backend and eclaire-workers can point to same or different endpoints as long as the model meets the requirements mentioned above. 
- You may choose LLM backend and models to best take advantage of your hardware depending how much GPU memory is available, whether you are running on Apple silicon and want to use MLX, etc. Larger and more powerful models should produce better results but require more memory and run more slowly.

### Steps for changing LLM backends
1. Decide which LLM backend you want to use
2. Download and make sure it's running locally
3. [AS NEEDED] Edit AI_LOCAL_PROVIDER_URL in apps/backend/.env.* and apps/backend.env.*. By default they will use different endpoints at port 11434 and 11435 respectively. 
4. [AS NEEDED] Edit the pm2.deps.config.js which is used to manage dependencies with PM2

### Steps for changing models
1. Check what models the system is currently using. From the repo root:
```
./tools/model-cli/run.sh list
```
You should see something like:
```

┌─────────────────────────────────────────┬───────────┬─────────────────────────────────┬─────────────────────────────────┬──────────────────┬─────────────┐
│ ID                                      │ Provider  │ Short Name                      │ Model                           │ Context          │ Status      │
├─────────────────────────────────────────┼───────────┼─────────────────────────────────┼─────────────────────────────────┼──────────────────┼─────────────┤
│ llamacpp-qwen3-14b-gguf-q4-k-xl         │ llamacpp  │ qwen3-14b-gguf-q4_k_xl          │ qwen3-14b-gguf-q4_k_xl          │ backend          │ 🟢 ACTIVE   │
├─────────────────────────────────────────┼───────────┼─────────────────────────────────┼─────────────────────────────────┼──────────────────┼─────────────┤
│ llamacpp-gemma-3-4b-it-qat-gguf-q4-k-xl │ llamacpp  │ gemma-3-4b-it-qat-gguf-q4_k_xl  │ gemma-3-4b-it-qat-gguf-q4_k_xl  │ workers          │ 🟢 ACTIVE   │
├─────────────────────────────────────────┼───────────┼─────────────────────────────────┼─────────────────────────────────┼──────────────────┼─────────────┤
```

2. Decide on models you want the Eclaire backend and workers to use. Get their Hugging Face URLs.

3. Run the model-cli "import" command (or edit config/models.json directly). Eg:
```
./tools/model-cli/run.sh import https://huggingface.co/mlx-community/Qwen3-30B-A3B-4bit-DWQ-10072025
```

4. Make sure that the LLM backend is started using the correct model. Eg. from pm2.deps.config.js:
```
  script: 'llama-server',
  args: '-hf unsloth/Qwen3-14B-GGUF:Q4_K_XL --port 11434', // CHANGE THIS TO YOUR NEW MODEL
```

5. Download the model locally before using the system. Each LLM backend has its own way of pulling models but with llama.cpp you can:
```
printf '' | llama-cli --hf-repo mlx-community/Qwen3-30B-A3B-4bit-DWQ-10072025 -n 0 --no-warmup
``` 

## Architecture

Eclaire follows a modular architecture with clear separation between the frontend, backend API, background workers, and data layers.

**📋 [View detailed architecture diagram →](docs/architecture.md)**

### Key Components
- **Frontend**: Next.js web application with React 19 and Radix UI
- **Backend API**: Node.js/Hono server interfacing with DB and providing REST APIs
- **Background Workers**: BullMQ/Redis background job processing and scheduling.
- **Data Layer**: PostgreSQL for persistence, storage abstraction for raw files and generated artifacts.
- **AI Services**: Local LLM backends (llama.cpp, etc) for model inference. Backend and workers use LLM endpoints. Backend for AI assistant (eg. Qwen3 model), Workers for image and document processing (eg. Gemma3 multi-modal). Docling for processing some of the document formats.
- **External Integrations**: API integration with GitHub and Reddit for bookmark fetching.

### Data Directory

The system automatically creates all required data directories when services start:
- `data/logs` - Application logs
- `data/users` - User files and assets
- `data/browser-data` - Browser profile data for workers
- `data/db` - PostgreSQL database files
- `data/redis` - Redis persistence files
- `data/users` - All system data for users including original uploads, fetched from bookmarks, files extracted and generated.

## Roadmap
- MCP Client/Host
- MCP Server
- Capacity and Scalability
- More streamlined system design
- Easier installs and upgrades
- Native mobile and desktop clients
- Support for more data sources
- Data source linking and synchronization
- More robust full text indexing and search
- Better extensibility
- Improved AI capabilities
  - tools
  - memory
  - context management
  - specialized tasks
- Evals for models and content pipelines
- Team and Org
- Unified CLI
- Easier LLM backend and models management
- More Hardening and Security
- Top requests from the community

## Contributing
We 💙 contributions! Please read the Contributing Guide.

## Security
See [SECURITY.md](./SECURITY.md) for our policy.

## Telemetry
There should be no telemetry in the Eclaire code although 3rd party dependencies may have. If you find an instance where that is the case, let us know.

## Community & Support
Issues: [GitHub Issues](https://github.com/eclaire-labs/eclaire/issues)
