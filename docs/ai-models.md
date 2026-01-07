# AI Model Configuration

This document explains how to configure AI models in Eclaire.

## Overview

Eclaire uses AI models for two distinct purposes:

| Context | Purpose | Requirements |
|---------|---------|--------------|
| **Backend** | Powers the chat assistant, handles conversations and tool calling | Good tool/function calling support |
| **Workers** | Processes documents, images, and other content | Vision capability for image/document analysis |

You can use the same model for both, or different models optimized for each task. The default setup uses separate models: a text model for the assistant and a vision model for workers.

## Single vs Dual Model Setup

You have two options for running local models with llama.cpp:

### Single Model (Simple)

Use one model for both backend and workers. This is the simplest setup -just run one llama-server instance:

```bash
llama-server -hf unsloth/Qwen3-VL-8B-Instruct-GGUF:Q4_K_XL --ctx-size 16384 --port 11500
```

Configure both contexts to use the same model in `selection.json`.

### Dual Model (Recommended)

Use different models optimized for each purpose:
- **Backend (port 11500)**: A smarter/larger model for the AI assistant -better reasoning and tool calling
- **Workers (port 11501)**: A smaller/faster model with vision for background processing -efficient document and image analysis

This setup requires two separate llama-server instances:

```bash
# Terminal 1: Backend model (AI assistant)
llama-server -hf unsloth/Qwen3-14B-GGUF:Q4_K_XL --ctx-size 16384 --port 11500

# Terminal 2: Workers model (vision processing)
llama-server -hf unsloth/gemma-3-4b-it-qat-GGUF:Q4_K_XL --ctx-size 16384 --port 11501
```

The default configuration uses the `llama-cpp` provider (port 11500) and `llama-cpp-2` provider (port 11501).

> **Note**: llama-server has a router mode that can serve multiple models from one instance, but it's not yet production-ready. We recommend running separate instances for reliability.

> **Context size**: The `--ctx-size 16384` flag limits context to 16K tokens to reduce GPU memory usage. Adjust based on your hardware -higher values allow longer conversations but require more memory.

Choose your setup based on your hardware and available memory. See [Model Recommendations](#model-recommendations) below for guidance.

## Using the CLI

The recommended way to manage models is through the Eclaire CLI. In Docker deployments, prefix commands with `docker compose run --rm eclaire`.

### List Available Models

```bash
# Show all configured models and which are active
eclaire model list

# Show memory requirements for local models
eclaire model list --memory

# Filter by context
eclaire model list --context backend
```

### Activate a Model

```bash
# Set the backend (assistant) model
eclaire model activate --backend llama-cpp:qwen3-14b-q4

# Set the workers model
eclaire model activate --workers llama-cpp:gemma-3-4b-q4

# Interactive selection
eclaire model activate
```

### Import Models

Import models directly from HuggingFace or OpenRouter:

```bash
# Import from HuggingFace (GGUF format for llama.cpp)
eclaire model import https://huggingface.co/unsloth/Qwen3-14B-GGUF

# Import from OpenRouter
eclaire model import https://openrouter.ai/models/anthropic/claude-3.5-sonnet
```

### Manage Providers

```bash
# List configured providers
eclaire provider list

# Add a new provider (interactive)
eclaire provider add

# Add using a preset
eclaire provider add --preset openrouter

# Test provider connectivity
eclaire provider test llama-cpp
```

### Validate Configuration

```bash
# Check configuration for errors
eclaire config validate

# Attempt to fix issues automatically
eclaire config validate --fix
```

### Engine Management (Local Only)

These commands manage the llama.cpp inference server. They only work when running Eclaire directly on the host (not in Docker):

```bash
# Check system readiness
eclaire engine doctor

# Start the inference server
eclaire engine up

# Stop the server
eclaire engine down

# View server logs
eclaire engine logs -f

# Download a model file
eclaire engine pull unsloth/Qwen3-14B-GGUF/Qwen3-14B-Q4_K_XL.gguf
```

## Configuration Files

AI configuration lives in `config/ai/` with three files:

```
config/ai/
├── providers.json   # LLM backend definitions
├── models.json      # Model configurations
└── selection.json   # Active model selection
```

### providers.json

Defines the LLM backends (inference servers) Eclaire can connect to:

```json
{
  "providers": {
    "llama-cpp": {
      "dialect": "openai_compatible",
      "baseUrl": "${ENV:LLAMA_CPP_BASE_URL}",
      "auth": { "type": "none" }
    },
    "llama-cpp-2": {
      "dialect": "openai_compatible",
      "baseUrl": "${ENV:LLAMA_CPP_BASE_URL_2}",
      "auth": { "type": "none" }
    },
    "openrouter": {
      "dialect": "openai_compatible",
      "baseUrl": "https://openrouter.ai/api/v1",
      "auth": {
        "type": "bearer",
        "header": "Authorization",
        "value": "Bearer ${ENV:OPENROUTER_API_KEY}"
      }
    }
  }
}
```

The default URLs are auto-detected based on runtime:
- **Local**: `http://127.0.0.1:11500/v1` and `http://127.0.0.1:11501/v1`
- **Container**: `http://host.docker.internal:11500/v1` and `http://host.docker.internal:11501/v1`

Key fields:
- `dialect`: API format (`openai_compatible` or `anthropic_messages`)
- `baseUrl`: The API endpoint URL (supports `${ENV:VAR_NAME}` interpolation)
- `auth`: Authentication configuration (supports `none`, `bearer`, or custom headers)

### models.json

Defines individual models and their capabilities:

```json
{
  "models": {
    "llama-cpp:qwen3-14b-q4": {
      "name": "Qwen 3 14B (Q4_K_XL)",
      "provider": "llama-cpp",
      "providerModel": "unsloth/Qwen3-14B-GGUF:Q4_K_XL",
      "capabilities": {
        "modalities": {
          "input": ["text"],
          "output": ["text"]
        },
        "streaming": true,
        "tools": true,
        "contextWindow": 32768
      }
    },
    "openrouter:claude-3.5-sonnet": {
      "name": "Claude 3.5 Sonnet",
      "provider": "openrouter",
      "providerModel": "anthropic/claude-3.5-sonnet",
      "capabilities": {
        "modalities": {
          "input": ["text", "image"],
          "output": ["text"]
        },
        "streaming": true,
        "tools": true,
        "contextWindow": 200000
      }
    }
  }
}
```

Key fields:
- `provider`: Must match a key in `providers.json`
- `providerModel`: The model identifier used by the provider
- `capabilities.modalities.input`: Include `"image"` for vision models
- `capabilities.tools`: Set to `true` for models that support function calling

### selection.json

Specifies which models are active:

```json
{
  "active": {
    "backend": "llama-cpp:qwen3-14b-q4",
    "workers": "llama-cpp:gemma-3-4b-q4"
  }
}
```

The values must match model IDs from `models.json`.

## Supported Providers

| Provider | Type | Dialect | Notes |
|----------|------|---------|-------|
| **llama.cpp** | Local | `openai_compatible` | Recommended for local inference |
| **Ollama** | Local | `openai_compatible` | Easy model management |
| **LM Studio** | Local | `openai_compatible` | GUI-based model loading |
| **vLLM** | Local | `openai_compatible` | High-performance inference |
| **OpenRouter** | Cloud | `openai_compatible` | Access to many models via one API |
| **OpenAI** | Cloud | `openai_compatible` | GPT models |
| **Anthropic** | Cloud | `anthropic_messages` | Claude models |

## MLX on Apple Silicon

Mac users with Apple Silicon (M1/M2/M3/M4) can take advantage of [MLX](https://github.com/ml-explore/mlx), Apple's machine learning framework optimized for the unified memory architecture.

### Requirements

1. **LLM Engine with MLX Support:**
   - [LM Studio](https://lmstudio.ai/) - GUI-based, easiest option
   - [MLX-LM](https://github.com/ml-explore/mlx-lm) - Command-line MLX inference
   - [MLX-VLM](https://github.com/Blaizzy/mlx-vlm) - Vision-language models with MLX

2. **MLX-Optimized Models:**
   - Download models from [MLX Community on Hugging Face](https://huggingface.co/mlx-community)
   - Look for models with "MLX" in the name or repository

### Configuration

Configure your MLX-compatible server as a provider in `config/ai/providers.json`:

```json
{
  "providers": {
    "lm-studio": {
      "dialect": "openai_compatible",
      "baseUrl": "http://127.0.0.1:1234/v1",
      "auth": { "type": "none" }
    }
  }
}
```

Then add models to `config/ai/models.json` and activate them with the CLI.

## Model Recommendations

Choose models based on your available memory:

### 8GB Memory
- **Backend**: Qwen3 4B or Gemma 3 4B (Q4 quantization)
- **Workers**: Same model for both contexts

### 16GB Memory
- **Backend**: Qwen3 8B (Q4) or Mistral 7B
- **Workers**: Gemma 3 4B (vision)

### 32GB+ Memory
- **Backend**: Qwen3 14B (Q4) - excellent tool calling
- **Workers**: Gemma 3 12B (vision) or Qwen3 VL 8B

### Cloud/Hybrid
For best results, use cloud models for complex reasoning and local models for routine processing:
- **Backend**: Claude 3.5 Sonnet or GPT-4o via OpenRouter
- **Workers**: Local vision model to keep data private

## Adding a HuggingFace Model Manually

1. Find a GGUF model on HuggingFace (e.g., `unsloth/Mistral-7B-GGUF`)

2. Add to `models.json`:
```json
"llama-cpp:mistral-7b-q4": {
  "name": "Mistral 7B (Q4)",
  "provider": "llama-cpp",
  "providerModel": "unsloth/Mistral-7B-GGUF:Q4_K_M",
  "capabilities": {
    "modalities": { "input": ["text"], "output": ["text"] },
    "streaming": true,
    "tools": true,
    "contextWindow": 32768
  }
}
```

3. Activate it:
```bash
eclaire model activate --backend llama-cpp:mistral-7b-q4
```

## Adding an OpenRouter Model Manually

1. Find the model on [OpenRouter](https://openrouter.ai/models)

2. Ensure the `openrouter` provider is configured in `providers.json` with your API key

3. Add to `models.json`:
```json
"openrouter:gpt-4o": {
  "name": "GPT-4o",
  "provider": "openrouter",
  "providerModel": "openai/gpt-4o",
  "capabilities": {
    "modalities": { "input": ["text", "image"], "output": ["text"] },
    "streaming": true,
    "tools": true,
    "contextWindow": 128000
  }
}
```

4. Activate it:
```bash
eclaire model activate --backend openrouter:gpt-4o
```
