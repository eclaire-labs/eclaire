# @eclaire/ai

Multi-provider AI client for TypeScript. Supports OpenAI-compatible APIs, Anthropic, and local models (MLX). Includes tool calling, streaming, token estimation, and an agent framework.

## Features

- **Multi-provider** — OpenAI, Anthropic, local models via MLX, or any OpenAI-compatible API (Ollama, LM Studio, OpenRouter, etc.)
- **Tool calling** — Native function calling with automatic execution loops
- **Streaming** — SSE streaming with parser, normalized across providers
- **Agents** — `RuntimeAgent` with tool loops, stop conditions, and skill injection
- **Capability-aware** — Validates model capabilities before making requests
- **Token estimation** — Pre-flight token counting via tiktoken

## Quick Start

```typescript
import { initAI, callAI } from "@eclaire/ai";

// Initialize once at startup
initAI({
  providers: {
    providers: {
      openai: {
        dialect: "openai_compatible",
        baseUrl: "https://api.openai.com/v1",
        auth: { type: "bearer", value: `Bearer ${process.env.OPENAI_API_KEY}` },
      },
    },
  },
  models: {
    models: {
      "openai:gpt-4o": {
        name: "GPT-4o",
        provider: "openai",
        providerModel: "gpt-4o",
        capabilities: {
          modalities: { input: ["text", "image"], output: ["text"] },
          streaming: true,
          tools: true,
          jsonSchema: true,
          structuredOutputs: true,
          reasoning: { supported: false },
          contextWindow: 128000,
          maxOutputTokens: 16384,
        },
        source: { url: "https://platform.openai.com/docs/models/gpt-4o" },
      },
    },
  },
  selection: {
    active: { default: "openai:gpt-4o" },
  },
});

// Make a call
const response = await callAI(
  [{ role: "user", content: "What is 2 + 2?" }],
  "default",
);
console.log(response.content);
```

## Configuration

### Programmatic (recommended for libraries)

Pass config objects directly to `initAI()`:

```typescript
initAI({
  providers: { providers: { /* ... */ } },
  models: { models: { /* ... */ } },
  selection: { active: { default: "provider:model-id" } },
});
```

### File-based (recommended for applications)

Point to a directory containing `providers.json`, `models.json`, and `selection.json`:

```typescript
initAI({ configPath: "./config/ai" });
```

Supports `${ENV:VAR_NAME}` interpolation in JSON files for secrets:

```json
{
  "providers": {
    "openai": {
      "dialect": "openai_compatible",
      "baseUrl": "https://api.openai.com/v1",
      "auth": { "type": "bearer", "value": "Bearer ${ENV:OPENAI_API_KEY}" }
    }
  }
}
```

## Streaming

```typescript
import { callAIStream, LLMStreamParser } from "@eclaire/ai";

// Get a raw stream
const { stream } = await callAIStream(
  [{ role: "user", content: "Write a haiku" }],
  "default",
);

// Parse SSE events
const parser = new LLMStreamParser();
const result = await parser.processSSEStream(stream);
console.log(result.content);
```

## Tool Calling

```typescript
import { callAI } from "@eclaire/ai";

const response = await callAI(
  [{ role: "user", content: "What's the weather in Paris?" }],
  "default",
  {
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get current weather for a location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string", description: "City name" },
            },
            required: ["location"],
          },
        },
      },
    ],
    toolChoice: "auto",
  },
);

if (response.toolCalls) {
  for (const call of response.toolCalls) {
    console.log(call.function.name, call.function.arguments);
  }
}
```

## Structured Output

```typescript
const response = await callAI(
  [{ role: "user", content: "List 3 colors" }],
  "default",
  {
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "colors",
        schema: {
          type: "object",
          properties: {
            colors: { type: "array", items: { type: "string" } },
          },
          required: ["colors"],
        },
        strict: true,
      },
    },
  },
);
```

## Agent

`RuntimeAgent` runs multi-step tool loops with automatic tool execution:

```typescript
import {
  RuntimeAgent,
  createRuntimeContext,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";

const searchTool: RuntimeToolDefinition = {
  name: "search",
  description: "Search for information",
  parameters: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
  execute: async ({ args }) => {
    const results = await mySearchFunction(args.query);
    return textResult(JSON.stringify(results));
  },
};

const agent = new RuntimeAgent({
  context: "default",
  systemPrompt: "You are a helpful assistant.",
  tools: [searchTool],
  maxSteps: 10,
});

const ctx = createRuntimeContext();
const result = await agent.generate(ctx, "Find recent news about AI");
console.log(result.content);
```

## Supported Providers

| Provider | Dialect | Example |
|----------|---------|---------|
| OpenAI | `openai_compatible` | GPT-4o, GPT-4o-mini |
| Anthropic | `anthropic_messages` | Claude Sonnet, Opus |
| OpenRouter | `openai_compatible` | Any model via OpenRouter |
| Ollama | `openai_compatible` | Local models |
| LM Studio | `openai_compatible` | Local models |
| MLX | `mlx_native` | Apple Silicon local models |

## Custom Logging

By default, the package logs to console. Pass a custom logger factory for integration with your logging stack:

```typescript
import pino from "pino";

const logger = pino({ level: "info" });

initAI({
  configPath: "./config/ai",
  createChildLogger: (name) => logger.child({ module: name }),
});
```

The logger must implement `{ debug, info, warn, error }` — each taking `(obj: Record<string, unknown>, msg?: string)`.

## API Reference

### Core

| Export | Description |
|--------|-------------|
| `initAI(config)` | Initialize the client (call once at startup) |
| `resetAI()` | Reset state (for testing) |
| `callAI(messages, context, options?)` | Non-streaming AI call |
| `callAIStream(messages, context, options?)` | Streaming AI call |
| `LLMStreamParser` | Parse SSE streams into structured results |

### Configuration

| Export | Description |
|--------|-------------|
| `getActiveModelForContext(ctx)` | Get active model config for a context |
| `getModels(filter?)` | List all configured models |
| `validateAIConfig(ctx)` | Validate config for a context |
| `resolveProviderForModel(id, config)` | Resolve provider URL and auth |

### Validation

| Export | Description |
|--------|-------------|
| `modelSupportsTools(model)` | Check tool calling support |
| `modelSupportsStreaming(model)` | Check streaming support |
| `modelSupportsReasoning(model)` | Check reasoning/thinking support |
| `estimateTokenCount(messages)` | Estimate input token count |

### Agent

| Export | Description |
|--------|-------------|
| `RuntimeAgent` | Multi-step agent with tool loops |
| `createRuntimeContext()` | Create agent execution context |
| `textResult(text)` | Helper to create tool results |
| `errorResult(msg)` | Helper to create error tool results |
| `registerTool(tool)` | Register a tool globally |
| `registerSkillSource(dir, scope)` | Register a skill directory |

## License

MIT
