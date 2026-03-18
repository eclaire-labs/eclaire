---
name: admin-guide
description: Guide instance administrators through AI provider setup, model configuration, MCP server management, and instance settings.
alwaysInclude: false
tags: [admin, configuration, setup]
---

# Admin Guide

As an instance administrator, you can manage the AI infrastructure directly through conversation. This guide covers the key concepts.

## AI Providers

Eclaire connects to AI models through **providers**. Each provider uses a specific API format (dialect):

- **OpenAI-compatible** — Works with OpenAI, Azure OpenAI, Together, Groq, Ollama, vLLM, and other compatible APIs
- **Anthropic Messages** — Anthropic's native API for Claude models
- **CLI JSONL** — Command-line inference with JSON Lines streaming
- **MLX Native** — Local inference on Apple Silicon

### Setting Up a Provider

To add a provider, you'll need:
- A unique identifier and display name
- The API dialect
- The API endpoint URL
- Authentication details (API key, token, or none for local services)

Common setups:
- **OpenAI**: Endpoint `https://api.openai.com/v1`, bearer auth with your API key
- **Anthropic**: Endpoint `https://api.anthropic.com`, API key in the `x-api-key` header
- **Local Ollama**: Endpoint `http://localhost:11434/v1`, no authentication needed

## AI Models

Models are linked to providers and represent specific AI models available for use.

### Adding a Model

To add a model, you'll need:
- A unique identifier and display name
- Which provider it belongs to (must already exist)
- The provider's model name (e.g., "gpt-4o", "claude-sonnet-4-20250514")

You can also specify model capabilities:
- Streaming support, tool/function calling, extended reasoning, vision/image input

## Model Selection

Model selection determines which model is used for different operations:
- **Backend** — Used for main assistant conversations
- **Workers** — Used for background processing tasks

You can check the current model assignments and change them as needed.

## MCP Servers

MCP (Model Context Protocol) servers extend the assistant with additional tools and capabilities.

### Adding an MCP Server

To add a server, you'll need:
- A unique identifier and display name
- The transport type:
  - **stdio** — Local command-line process (specify the command and arguments)
  - **sse** or **http** — Remote server (specify the URL)

Note: After adding or changing an MCP server, a server restart may be needed for the connection to initialize.

## Instance Settings

Global settings that apply to the entire Eclaire instance:

- **Registration** — Whether new users can self-register
- **Audio defaults** — Default speech-to-text model, text-to-speech model, and TTS voice

You can check all current settings and update them as needed.

## Common Admin Workflows

### Setting up a new AI provider and model
1. First, check what providers already exist
2. Add the new provider with its API endpoint and credentials
3. Add one or more models under the new provider
4. Optionally, set the new model as the active model for conversations or background processing

### Changing the active model
1. Check the current model assignments
2. Review available models
3. Update the assignment for the desired context (backend or workers)

### Adding a new tool server
1. Check existing MCP servers
2. Add the new server with its transport configuration
3. Note that a restart may be needed for the server to connect
