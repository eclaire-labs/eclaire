# @eclaire/channels

Connect your AI to messaging platforms. Each adapter handles bot lifecycle, streaming responses, session management, and slash commands — you just provide the AI.

## Packages

| Package | Platform | Install |
|---|---|---|
| `@eclaire/channels-core` | Core types & registry | `pnpm add @eclaire/channels-core` |
| `@eclaire/channels-discord` | Discord | `pnpm add @eclaire/channels-discord discord.js` |
| `@eclaire/channels-slack` | Slack | `pnpm add @eclaire/channels-slack @slack/bolt @slack/web-api` |
| `@eclaire/channels-telegram` | Telegram | `pnpm add @eclaire/channels-telegram telegraf` |

Install only the adapters you need. Each adapter depends on `@eclaire/channels-core` automatically.

## Quick Start

```typescript
import { ChannelRegistry } from "@eclaire/channels-core";
import { initTelegramAdapter } from "@eclaire/channels-telegram";

const registry = new ChannelRegistry();

const telegram = initTelegramAdapter({
  // Data access — bring your own database
  findChannel: (id, userId) => db.channels.findOne({ id, userId }),
  findChannelById: (id) => db.channels.findOne({ id, platform: "telegram", isActive: true }),
  findActiveChannels: () => db.channels.find({ platform: "telegram", isActive: true }),

  // AI — plug in any LLM
  processPromptRequest: async ({ userId, prompt }) => {
    const res = await myAI.chat(prompt);
    return { response: res.content };
  },

  // Config encryption
  encrypt: (value) => myEncrypt(value),
  decrypt: (value) => myDecrypt(value),

  // Optional
  recordHistory: async () => {},
  logger: console,
});

registry.register(telegram);
await registry.startAll();
```

## Architecture

```
@eclaire/channels-core        ChannelAdapter interface, ChannelRegistry, shared types
  ├── @eclaire/channels-discord   Discord adapter (discord.js)
  ├── @eclaire/channels-slack     Slack adapter (@slack/bolt, socket mode)
  └── @eclaire/channels-telegram  Telegram adapter (telegraf, long polling)
```

Each adapter uses **dependency injection** — no hard dependencies on any database, ORM, or AI library. You provide callbacks for:

| Dependency | Purpose |
|---|---|
| `findChannel` / `findChannelById` / `findActiveChannels` | Load channel records from your database |
| `processPromptRequest` | Send a user message to your AI and get a response |
| `processPromptRequestStream` | *(optional)* Streaming variant for real-time responses |
| `encrypt` / `decrypt` | Protect bot tokens and secrets at rest |
| `recordHistory` | Log activity (can be a no-op) |
| `logger` | Any logger with `info`, `warn`, `error`, `debug` methods |

### Optional session deps

For slash command support (`/new`, `/history`, `/clear`, `/settings`):

| Dependency | Purpose |
|---|---|
| `createSession` | Start a new conversation |
| `listSessions` | List recent conversations |
| `deleteSession` | Delete a conversation |
| `getModelInfo` | Show current model info |

## Channel Record

Adapters expect a `ChannelRecord` shape from your data callbacks:

```typescript
interface ChannelRecord {
  id: string;
  userId: string;
  name: string;
  platform: "telegram" | "slack" | "discord" | "whatsapp" | "email";
  capability: "notification" | "chat" | "bidirectional";
  config: unknown; // encrypted platform config (bot tokens, channel IDs, etc.)
  isActive: boolean;
}
```

## Features

- **Streaming responses** — real-time message updates as your AI generates text
- **Session management** — multi-turn conversations with session tracking
- **Slash commands** — built-in `/new`, `/clear`, `/history`, `/settings`, `/help`
- **Bot pooling** — multiple channels sharing the same bot token use one connection
- **Retry with backoff** — automatic retries for transient platform errors
- **Circuit breakers** — typing indicators degrade gracefully under rate limits
- **Voice support** — Discord voice channels and voice message handling
