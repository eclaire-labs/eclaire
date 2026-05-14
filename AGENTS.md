# Eclaire

## Commands
- `pnpm test:unit` — run all unit tests
- `pnpm lint` — oxlint
- `pnpm format` — oxfmt
- `pnpm typecheck` — typecheck all packages
- `pnpm dev` — start backend + frontend

## Important: Always use pnpm scripts if available instead of running tools directly
- For linting: `pnpm lint` (not `npx oxlint`)
- For formatting: `pnpm format` (not `npx oxfmt`)
- For tests: `pnpm test:unit` (not `npx vitest`)
- For DB migrations: `pnpm --filter @eclaire/db db:generate:pg` / `db:generate:sqlite` (not `npx drizzle-kit generate`)
- **Always run `pnpm lint` and `pnpm format` after making code changes** before considering the task complete.

## Testing
- Vitest across all packages
- Run all: `pnpm test:unit`
- Run specific package: `pnpm --filter @eclaire/ai test`
