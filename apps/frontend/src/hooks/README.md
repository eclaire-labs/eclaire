# Data-fetching conventions

- **Every server resource gets exactly one hook module**: `src/hooks/use-<entity>.ts`.
  Build it on `createCrudHooks` (`create-crud-hooks.ts`) when the endpoint returns
  cursor-paginated `{ items, nextCursor, hasMore }`; otherwise use plain TanStack
  Query inside the hook.
- **Components and pages never call `apiFetch` directly** — they import hooks from
  `src/hooks/**`. Thin typed wrappers around specific endpoints live in
  `src/lib/api-*.ts` and are consumed by hooks, not components.
- **Entity-specific extra endpoints** (upload, reprocess, comments, …) are extra
  mutations inside the entity's hook module — see the upload mutation in
  `use-notes.ts` for the reference pattern.
- **Detail pages** use the factory's `useSingle(id)` for fetching _and_ mutations
  (`update`, `deleteItem`); don't hand-roll `apiFetch` PATCH calls.
- **Loading/error states** use `PageLoading` / `PageError` from
  `src/components/shared/page-state.tsx` rather than ad-hoc spinners.
- Error toasts for CRUD mutations are built into the factory; success toasts stay
  at call sites (they're message-specific).
