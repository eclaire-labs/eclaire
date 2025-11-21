# Database Tests

Comprehensive test suite for the dual-database architecture (PostgreSQL + SQLite).

## Overview

These tests ensure compatibility and correctness across both database implementations:
- **PostgreSQL** (via PGlite in tests)
- **SQLite** (via better-sqlite3)

## Test Structure

### 1. Type Conversion Tests (`type-conversions.test.ts`)
Tests critical type differences between databases:
- **Boolean**: PostgreSQL `boolean` ↔ SQLite `integer(0/1)`
- **Timestamp**: PostgreSQL `timestamp` ↔ SQLite `integer(epoch_ms)` → both expose `Date` objects
- **JSON**: PostgreSQL `jsonb` ↔ SQLite `text(json)` → both parse to objects
- **Numeric**: PostgreSQL `numeric` ↔ SQLite `text` (for fNumber, latitude, etc.)

### 2. Transaction Tests (`transactions.test.ts`)
Tests transaction adapter behavior:
- Basic CRUD operations within transactions
- Rollback on error (atomicity)
- Multi-table transactions (tasks + tags pattern)
- Sync enforcement for SQLite (throws if async callback used)
- Deferred execution for PostgreSQL (queued operations)

### 3. Schema Parity Tests (`schema-parity.test.ts`)
Verifies both schemas produce compatible results:
- Default values (`createdAt`, `updatedAt`, `isPinned`, etc.)
- Nullable fields (NULL handling)
- Foreign key cascades
- Unique constraints
- NOT NULL constraints

### 4. Migration Tests (`migrations.test.ts`)
Tests migration system:
- Fresh migrations on empty database
- Schema validation (all expected tables exist)
- Idempotency (re-running migrations doesn't break)
- Foreign key constraints after migration
- Index creation

### 5. Adapter Integration Tests (`adapters.test.ts`)
Tests repository methods through transaction manager:
- Insert operations (single and batch)
- Update operations (with complex where clauses)
- Delete operations (conditional and cascade)
- Error handling (constraint violations, foreign key errors)
- Multi-table operations (task + tags pattern)

## Running Tests

```bash
# Run all database tests
pnpm test:db

# Run specific test file
pnpm vitest run src/tests/db/type-conversions.test.ts
pnpm vitest run src/tests/db/transactions.test.ts
pnpm vitest run src/tests/db/schema-parity.test.ts
pnpm vitest run src/tests/db/migrations.test.ts
pnpm vitest run src/tests/db/adapters.test.ts

# Watch mode for development
pnpm test:db:watch
```

## Prerequisites

### Native Dependencies

**better-sqlite3** requires native compilation. Ensure you have:
- Node.js 24+ (matching your project's requirement)
- Python (for node-gyp)
- C++ build tools

To install/rebuild native dependencies:

```bash
# From monorepo root
pnpm install

# If better-sqlite3 bindings are missing, rebuild:
cd apps/backend
pnpm rebuild better-sqlite3
```

If you encounter errors like "Could not locate the bindings file", you may need to:
```bash
# Clear node_modules and reinstall
rm -rf node_modules
pnpm install
```

## Test Database Setup

Each test suite:
1. Creates an in-memory database (SQLite: `:memory:`, PGlite: ephemeral)
2. Runs migrations to set up schema
3. Executes tests
4. Cleans up after completion

This ensures:
- Fast test execution (no disk I/O)
- Isolation between test runs
- No external database dependencies

## Architecture Notes

### Dual-Database Support

The codebase uses a **ports and adapters pattern** to achieve database portability:

**Port**: `TransactionManager` interface (defined in `src/ports/tx.ts`)
- Provides sync callback API for transactions
- Exposes repository methods (`insert`, `update`, `delete`)
- Ensures type safety across database implementations

**Adapters**:
- **PostgreSQL/PGlite** (`src/db/adapters/postgres/tx.ts`): Async adapter with deferred execution
- **SQLite** (`src/db/adapters/sqlite/tx.ts`): Sync adapter with immediate execution

### Type Mapping

| JavaScript Type | PostgreSQL | SQLite | Notes |
|----------------|-----------|--------|-------|
| `boolean` | `boolean` | `integer` (0/1) | Drizzle handles conversion |
| `Date` | `timestamp` | `integer` (epoch ms) | Both expose Date objects |
| `object` | `jsonb` | `text` (JSON) | Both parse automatically |
| `string` (decimal) | `numeric` | `text` | EXIF data (fNumber, lat/long) |

### Transaction Semantics

**SQLite (better-sqlite3)**:
- Requires synchronous callbacks
- Operations execute immediately
- Throws error if async operations detected
- Example:
  ```typescript
  await txManager.withTransaction((tx) => {
    tx.bookmarks.insert({ ... });  // Executes immediately
    // NO await allowed here!
  });
  ```

**PostgreSQL/PGlite**:
- Accepts synchronous callbacks
- Operations are queued during callback
- Executes all operations after callback returns
- Example:
  ```typescript
  await txManager.withTransaction((tx) => {
    tx.bookmarks.insert({ ... });  // Queued
    tx.tags.insert({ ... });      // Queued
    // Both execute after callback returns
  });
  ```

## Test Coverage

Essential coverage includes:
- ✅ Type conversions (boolean, timestamp, JSON, numeric)
- ✅ Transaction CRUD operations
- ✅ Transaction rollback on error
- ✅ Schema defaults and constraints
- ✅ Foreign key enforcement and cascades
- ✅ Migration execution and validation
- ✅ Adapter insert/update/delete operations
- ✅ Error handling (constraint violations)

## Extending Tests

To add new tests:

1. **Import schemas and setup utilities**:
   ```typescript
   import { initTestDatabase, createTestUser, DB_TEST_CONFIGS } from "./setup";
   import * as pgSchema from "@/db/schema/postgres";
   import * as sqliteSchema from "@/db/schema/sqlite";
   ```

2. **Use parameterized tests** to run against both databases:
   ```typescript
   describe.each(DB_TEST_CONFIGS)("$label - My Test Suite", ({ dbType }) => {
     let testDb: TestDatabase;

     beforeEach(async () => {
       testDb = await initTestDatabase(dbType);
     });

     afterAll(async () => {
       await testDb.cleanup();
     });

     it("should do something", async () => {
       // Test implementation
     });
   });
   ```

3. **Handle database-specific logic**:
   ```typescript
   if (dbType === "sqlite") {
     await db.insert(sqliteSchema.bookmarks).values({ ... });
   } else {
     await db.insert(pgSchema.bookmarks).values({ ... });
   }
   ```

## Troubleshooting

### "Could not locate the bindings file" Error

This means better-sqlite3 native bindings aren't compiled. Try:
```bash
pnpm rebuild better-sqlite3
```

If that doesn't work, delete node_modules and reinstall:
```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Tests Fail with Schema Errors

Ensure migrations are up to date:
```bash
pnpm db:migrate:generate  # If you made schema changes
```

Check that both schema files are in sync:
- `src/db/schema/postgres.ts`
- `src/db/schema/sqlite.ts`

### PGlite Initialization Errors

PGlite should work out of the box. If you see initialization errors:
1. Check that `@electric-sql/pglite` is installed
2. Verify Node.js version matches project requirement (24+)

## Future Enhancements

Potential additions to test coverage:
- [ ] Concurrent transaction tests
- [ ] Performance benchmarks (SQLite vs PostgreSQL)
- [ ] Migration rollback tests
- [ ] Real PostgreSQL server testing (optional, for prod confidence)
- [ ] Complex query tests (joins, aggregations, full-text search)
- [ ] Database-specific feature tests (JSONB indexing, GIN indexes)

## References

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3)
- [PGlite Documentation](https://electric-sql.com/docs/api/pglite)
- [Vitest Documentation](https://vitest.dev/)
