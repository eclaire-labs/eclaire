# @eclaire/storage

A simple storage abstraction for Node.js. Write, read, list, and delete objects using a unified interface — swap between local filesystem and in-memory backends with zero code changes. Zero runtime dependencies.

## Install

```bash
npm install @eclaire/storage
```

## Quick start

```typescript
import { LocalStorage } from "@eclaire/storage/local";

const storage = new LocalStorage({ baseDir: "./data" });

// Write a file
await storage.writeBuffer("uploads/avatar.png", buffer, {
  contentType: "image/png",
});

// Read it back
const { buffer: data, metadata } = await storage.readBuffer("uploads/avatar.png");
console.log(metadata.contentType); // "image/png"
console.log(metadata.size); // byte count

// Check existence / get metadata without reading
if (await storage.exists("uploads/avatar.png")) {
  const meta = await storage.head("uploads/avatar.png");
}

// List objects by prefix (with pagination)
const { keys, nextCursor } = await storage.list({ prefix: "uploads/", limit: 50 });

// Delete
await storage.delete("uploads/avatar.png");

// Delete everything under a prefix
const deleted = await storage.deletePrefix("uploads/");
```

## Adapters

### LocalStorage

Stores files on disk. Metadata is persisted in sidecar `.meta.json` files alongside each object.

```typescript
import { LocalStorage } from "@eclaire/storage/local";

const storage = new LocalStorage({
  baseDir: "/var/data/storage", // required — root directory for all objects
  logger: myLogger,             // optional — any object with debug/info/warn/error methods
  fileMode: 0o644,              // optional — Unix file permissions
  dirMode: 0o755,               // optional — Unix directory permissions
});
```

### MemoryStorage

Keeps everything in memory. Same interface, perfect for tests.

```typescript
import { MemoryStorage } from "@eclaire/storage/memory";

const storage = new MemoryStorage();

// Run your code against `storage` exactly like LocalStorage...

// Test helpers
storage.size;    // number of stored objects
storage.clear(); // wipe everything
```

### Swapping backends

Because both adapters implement the same `Storage` interface, your application code stays the same:

```typescript
import type { Storage } from "@eclaire/storage/core";

function createStorage(env: string): Storage {
  if (env === "test") return new MemoryStorage();
  return new LocalStorage({ baseDir: "./data" });
}
```

## Streams

For large files, use the streaming API instead of buffers:

```typescript
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

// Write from a Node stream
await storage.write("videos/clip.mp4", createReadStream("./clip.mp4"), {
  contentType: "video/mp4",
});

// Read as a Web ReadableStream
const { stream, metadata } = await storage.read("videos/clip.mp4");
```

## Errors

All errors extend `StorageError` so you can catch them granularly:

```typescript
import {
  StorageNotFoundError,
  StorageInvalidKeyError,
} from "@eclaire/storage/core";

try {
  await storage.read("missing-key");
} catch (err) {
  if (err instanceof StorageNotFoundError) {
    console.log(`Not found: ${err.key}`);
  }
}
```

| Error | When |
|---|---|
| `StorageNotFoundError` | `read()` or `readBuffer()` on a missing key |
| `StorageInvalidKeyError` | Path traversal attempt or malformed key |
| `StorageAccessDeniedError` | Permission denied on the filesystem |
| `StorageQuotaExceededError` | Storage limit exceeded |

Note: `head()` and `exists()` return `null`/`false` for missing keys instead of throwing.

## Custom metadata

Attach arbitrary string key-value pairs to any object:

```typescript
await storage.writeBuffer("docs/report.pdf", buffer, {
  contentType: "application/pdf",
  custom: { originalFilename: "Q4 Report.pdf", uploadedBy: "user-42" },
});

const meta = await storage.head("docs/report.pdf");
console.log(meta?.custom?.originalFilename); // "Q4 Report.pdf"
```

## Key helpers (optional)

The `@eclaire/storage/keys` entry point provides opinionated helpers if you organize keys as `{userId}/{category}/{assetId}/{fileName}`:

```typescript
import { buildKey, parseKey, assetPrefix } from "@eclaire/storage/keys";

buildKey("user-1", "photos", "photo-1", "original.jpg");
// => "user-1/photos/photo-1/original.jpg"

parseKey("user-1/photos/photo-1/original.jpg");
// => { userId: "user-1", category: "photos", assetId: "photo-1", fileName: "original.jpg" }

assetPrefix("user-1", "photos", "photo-1");
// => "user-1/photos/photo-1/"
```

These are entirely optional — the `Storage` interface works with any string key.

## Entry points

| Path | What's in it |
|---|---|
| `@eclaire/storage` | Everything below, re-exported for convenience |
| `@eclaire/storage/core` | `Storage` interface, types, errors, key safety validators |
| `@eclaire/storage/keys` | Opinionated key builders/parsers (optional) |
| `@eclaire/storage/local` | `LocalStorage` adapter |
| `@eclaire/storage/memory` | `MemoryStorage` adapter |

## License

MIT
