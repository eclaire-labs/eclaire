# @eclaire/queue

Job queue abstraction with pluggable backends — use Redis (BullMQ) for production scale, or your existing PostgreSQL/SQLite database for zero-Redis deployments.

## Features

- **Dual-driver architecture** — BullMQ (Redis) or database-backed (PostgreSQL / SQLite)
- **Unified API** — same `QueueClient` / `Worker` / `Scheduler` interfaces across all drivers
- **Multi-stage progress tracking** — granular stage-by-stage progress with real-time callbacks
- **Flexible retries** — exponential, linear, or fixed backoff with dedicated error classes
- **Idempotency keys** — prevent duplicate job processing
- **Recurring jobs** — cron-based scheduling with enable/disable controls
- **Real-time events** — hook into job lifecycle for SSE or WebSocket updates
- **Type-safe** — full TypeScript with generic job payloads

## Install

```bash
npm install @eclaire/queue
```

Peer dependencies vary by driver:

| Driver | Peer dependencies |
|---|---|
| BullMQ | `bullmq`, `ioredis` |
| Database | `drizzle-orm` + your database driver (`postgres`, `better-sqlite3`, etc.) |

## Quick Start

### BullMQ (Redis)

```typescript
import {
  createBullMQClient,
  createBullMQWorker,
} from "@eclaire/queue/driver-bullmq";

const logger = console; // or pino, winston, etc.

// Create a client
const client = createBullMQClient({
  redis: { url: "redis://localhost:6379" },
  logger,
});

// Enqueue a job
await client.enqueue("email-send", {
  to: "user@example.com",
  subject: "Hello",
});

// Process jobs
const worker = createBullMQWorker(
  "email-send",
  async (ctx) => {
    const { to, subject } = ctx.job.data;
    await sendEmail(to, subject);
    ctx.log(`Email sent to ${to}`);
  },
  {
    redis: { url: "redis://localhost:6379" },
    logger,
  },
);

await worker.start();
```

### Database (PostgreSQL)

```typescript
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  createDbQueueClient,
  createDbWorker,
  createPgNotifyEmitter,
  createPgNotifyListener,
  queueJobsPg,
  queueSchedulesPg,
} from "@eclaire/queue/driver-db";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// PG NOTIFY for instant worker wakeup (optional but recommended)
const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
await pgClient.connect();
const emitter = createPgNotifyEmitter(pgClient, { logger });
const listener = createPgNotifyListener(pgClient, { logger });

const schema = { queueJobs: queueJobsPg, queueSchedules: queueSchedulesPg };
const capabilities = { skipLocked: true, notify: true, jsonb: true, type: "postgres" as const };

// Create client
const client = createDbQueueClient({
  db,
  schema,
  capabilities,
  logger,
  notifyEmitter: emitter,
});

// Enqueue a job
await client.enqueue("image-resize", { imageId: "img_123", width: 800 });

// Process jobs
const worker = createDbWorker(
  "image-resize",
  async (ctx) => {
    const { imageId, width } = ctx.job.data;
    await resizeImage(imageId, width);
  },
  { db, schema, capabilities, logger, notifyListener: listener },
);

await worker.start();
```

### Database (SQLite)

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  createDbQueueClient,
  createDbWorker,
  createInMemoryNotify,
  queueJobsSqlite,
  queueSchedulesSqlite,
} from "@eclaire/queue/driver-db";

const sqlite = new Database("queue.db");
const db = drizzle(sqlite);
const { emitter, listener } = createInMemoryNotify({ logger });

const schema = { queueJobs: queueJobsSqlite, queueSchedules: queueSchedulesSqlite };
const capabilities = { skipLocked: false, notify: false, jsonb: false, type: "sqlite" as const };

const client = createDbQueueClient({ db, schema, capabilities, logger, notifyEmitter: emitter });
const worker = createDbWorker("tasks", handler, { db, schema, capabilities, logger, notifyListener: listener });

await worker.start();
```

## Subpath Exports

| Import | Description |
|---|---|
| `@eclaire/queue` | Core types, utilities, and Redis connection helpers |
| `@eclaire/queue/core` | Zero-dependency types and error classes |
| `@eclaire/queue/driver-bullmq` | Redis/BullMQ driver |
| `@eclaire/queue/driver-db` | PostgreSQL and SQLite driver |
| `@eclaire/queue/driver-db/schema/postgres` | PostgreSQL Drizzle table schemas |
| `@eclaire/queue/driver-db/schema/sqlite` | SQLite Drizzle table schemas |
| `@eclaire/queue/transport-http` | HTTP transport for remote workers |

## Job Options

```typescript
await client.enqueue("queue-name", payload, {
  key: "unique-key",           // Idempotency key
  priority: 10,                // Higher = processed first (default: 0)
  delay: 5000,                 // Delay in ms before job becomes available
  runAt: new Date("2025-01-01"), // Run at specific time
  attempts: 5,                 // Max retry attempts (default: 3)
  backoff: {                   // Retry backoff strategy
    type: "exponential",       // "exponential" | "linear" | "fixed"
    delay: 1000,               // Base delay in ms
    maxDelay: 300_000,         // Cap for exponential backoff
  },
  replace: "if_not_active",    // Don't replace jobs currently processing
  initialStages: ["validate", "process", "store"], // Multi-stage setup
  metadata: { userId: "u_1" }, // Application metadata (for routing, etc.)
});
```

## Error Handling

Throw specific error classes from your job handler to control retry behavior:

```typescript
import {
  RateLimitError,
  RetryableError,
  PermanentError,
} from "@eclaire/queue/core";

async function handler(ctx) {
  // Reschedule without counting as a failed attempt
  throw new RateLimitError(60_000); // retry after 60s

  // Explicitly retry (counts as an attempt)
  throw new RetryableError("Temporary network failure");

  // Fail permanently — no retries
  throw new PermanentError("Invalid input data");

  // Any other Error is treated as retryable by default
}
```

Type guards are available: `isRateLimitError()`, `isRetryableError()`, `isPermanentError()`, `isQueueError()`.

## Multi-Stage Progress

Track granular progress through named stages:

```typescript
const worker = createBullMQWorker("process", async (ctx) => {
  await ctx.initStages(["validate", "extract", "tag"]);

  await ctx.startStage("validate");
  await validate(ctx.job.data);
  await ctx.completeStage("validate");

  await ctx.startStage("extract");
  const content = await extract(ctx.job.data);
  await ctx.updateStageProgress("extract", 50);
  const metadata = await parseMetadata(content);
  await ctx.completeStage("extract", { wordCount: content.length });

  await ctx.startStage("tag");
  await tagContent(content, metadata);
  await ctx.completeStage("tag");
}, workerConfig);
```

Wire up real-time updates via `eventCallbacks` in worker config:

```typescript
{
  eventCallbacks: {
    onStageStart: (jobId, stage) => { /* push SSE event */ },
    onStageProgress: (jobId, stage, percent) => { /* ... */ },
    onStageComplete: (jobId, stage, artifacts) => { /* ... */ },
    onJobComplete: (jobId) => { /* ... */ },
    onJobFail: (jobId, error) => { /* ... */ },
  }
}
```

## Recurring Jobs

Use the `Scheduler` to create cron-based recurring jobs:

```typescript
import { createBullMQScheduler } from "@eclaire/queue/driver-bullmq";
// or: import { createDbScheduler } from "@eclaire/queue/driver-db";

const scheduler = createBullMQScheduler({
  redis: { url: "redis://localhost:6379" },
  logger,
});

await scheduler.upsert({
  key: "daily-cleanup",
  queue: "maintenance",
  cron: "0 2 * * *", // Every day at 2 AM
  data: { maxAgeDays: 30 },
});

await scheduler.start();

// Manage schedules
await scheduler.setEnabled("daily-cleanup", false); // pause
await scheduler.remove("daily-cleanup");             // delete
const schedules = await scheduler.list();            // list all
```

## Worker Options

```typescript
const worker = createBullMQWorker("queue", handler, {
  ...driverConfig,
  concurrency: 3,            // Process 3 jobs at once (default: 1)
  lockDuration: 600_000,     // 10 min lock (default: 5 min)
  heartbeatInterval: 30_000, // Heartbeat every 30s (default: 60s)
  stalledInterval: 15_000,   // Check stalled jobs every 15s (default: 30s)
});
```

Call `ctx.heartbeat()` inside long-running handlers to extend the lock and prevent the job from being reclaimed.

## Logger

All drivers accept a `logger` implementing this minimal interface:

```typescript
interface QueueLogger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}
```

Compatible with `pino`, `winston`, and `console`.

## License

MIT
