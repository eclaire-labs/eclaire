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

Choose your setup based on your hardware and available memory.

## Using the CLI

The recommended way to manage models is through the Eclaire CLI. In Docker deployments, prefix commands with `docker compose run --rm eclaire`.

### List Available Models

```bash
# Show all configured models and which are active
eclaire model list

# Filter by context
eclaire model list --context backend
```

### Import Models

Import models directly from HuggingFace or OpenRouter. This fetches model metadata and adds it to your local model registry.

> **Note**: For HuggingFace models, import only adds the model configuration. You'll still need to download the model file when you first use it (llama-server downloads automatically on startup).

```bash
# Import from HuggingFace (GGUF format for llama.cpp)
eclaire model import https://huggingface.co/unsloth/Qwen3-14B-GGUF

# Import from OpenRouter
eclaire model import https://openrouter.ai/qwen/qwen3-vl-30b-a3b-instruct
```

### Activate a Model

Activate a model that has already been configured (either imported or manually added):

```bash
# Set the backend (assistant) model
eclaire model activate --backend llama-cpp:qwen3-14b-q4

# Set the workers model
eclaire model activate --workers llama-cpp:gemma-3-4b-q4

# Interactive selection
eclaire model activate
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
    "openrouter:qwen-qwen3-vl-30b-a3b-instruct": {
      "name": "Qwen: Qwen3 VL 30B A3B Instruct",
      "provider": "openrouter",
      "providerModel": "qwen/qwen3-vl-30b-a3b-instruct",
      "capabilities": {
        "modalities": {
          "input": ["text", "image"],
          "output": ["text"]
        },
        "streaming": true,
        "tools": true,
        "contextWindow": 131072
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
    "workers": "llama-cpp-2:gemma-3-4b-q4"
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

Mac users with Apple Silicon (M1/M2/M3/M4/M5) can take advantage of [MLX](https://github.com/ml-explore/mlx), Apple's machine learning framework optimized for the unified memory architecture.

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

## Adding a HuggingFace Model Manually

1. Find a GGUF model on HuggingFace (e.g., `unsloth/Qwen3-VL-30B-A3B-Instruct-GGUF`)

2. Add to `models.json`:
```json
"llama-cpp:qwen3-vl-30b-a3b-instruct-gguf-q4-k-xl": {
  "name": "Qwen3 VL 30B A3B Instruct (Q4_K_XL)",
  "provider": "llama-cpp",
  "providerModel": "unsloth/Qwen3-VL-30B-A3B-Instruct-GGUF:Q4_K_XL",
  "capabilities": {
    "modalities": { "input": ["text", "image"], "output": ["text"] },
    "streaming": true,
    "tools": true,
    "contextWindow": 262144
  }
}
```

3. Activate it:
```bash
eclaire model activate --backend llama-cpp:qwen3-vl-30b-a3b-instruct-gguf-q4-k-xl
```

## Adding an OpenRouter Model Manually

1. Find the model on [OpenRouter](https://openrouter.ai/models) (e.g., [qwen/qwen3-vl-30b-a3b-instruct](https://openrouter.ai/models/qwen/qwen3-vl-30b-a3b-instruct))

2. Ensure the `openrouter` provider is configured in `providers.json` with your API key

3. Add to `models.json`:
```json
"openrouter:qwen-qwen3-vl-30b-a3b-instruct": {
  "name": "Qwen: Qwen3 VL 30B A3B Instruct",
  "provider": "openrouter",
  "providerModel": "qwen/qwen3-vl-30b-a3b-instruct",
  "capabilities": {
    "modalities": { "input": ["text", "image"], "output": ["text"] },
    "streaming": true,
    "tools": true,
    "contextWindow": 131072
  }
}
```

4. Activate it:
```bash
eclaire model activate --backend openrouter:qwen-qwen3-vl-30b-a3b-instruct
```
