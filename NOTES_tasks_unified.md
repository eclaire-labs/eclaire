# Unified Tasks — Implementation Notes

## Status

**Implemented.** The unified task model replaced the previous 4-entity system (Task, ScheduledAction, TaskSeries, AgentRun) with 2 entities (Task, TaskOccurrence). All schema, services, routes, agent tools, workers, and frontend have been updated.

Previous architecture doc: `NOTES_scheduled.md` (now outdated).

## What Changed

### Before (4 entities)

| Entity | Purpose |
|--------|---------|
| Task | Work items with status, priority, due date |
| ScheduledAction | Reminders and scheduled agent runs (one-off or recurring) |
| TaskSeries | Recurring task templates that spawn Task instances |
| AgentRun | One AI execution on a task |

5 nav items, 7+ pages, 13+ agent tools, 50-line system prompt disambiguation.

### After (2 entities)

| Entity | Purpose |
|--------|---------|
| Task | Everything — work items, reminders, scheduled agent work, recurring tasks |
| TaskOccurrence | Every execution, delivery, or retry on a task |

2 nav items (Inbox + Tasks), 3 pages, 9 agent tools, simple system prompt.

## Core Domain Model

### Task

```ts
type TaskStatus = "open" | "in_progress" | "blocked" | "completed" | "cancelled";
type DelegateMode = "manual" | "assist" | "handle";
type ReviewStatus = "none" | "pending" | "approved" | "changes_requested";
type AttentionStatus = "none" | "needs_triage" | "awaiting_input" | "needs_review" | "failed" | "urgent";
type ExecutionStatus = "idle" | "scheduled" | "queued" | "running" | "awaiting_input" | "awaiting_review" | "failed" | "completed" | "cancelled";
type ScheduleType = "none" | "one_time" | "recurring";
```

### Task Occurrence

```ts
type TaskOccurrenceKind = "manual_run" | "scheduled_run" | "recurring_run" | "reminder" | "review_run";
```

## Implemented Schema

### `tasks` table

```
id                      text PK
user_id                 FK → users (owner)
title                   text NOT NULL
description             text
prompt                  text (agent instructions)
delegate_actor_id       FK → actors (who does the work)
delegate_mode           enum: manual | assist | handle
delegated_by_actor_id   FK → actors (agent-to-agent delegation chain)
task_status             enum: open | in_progress | blocked | completed | cancelled
attention_status        enum: none | needs_triage | awaiting_input | needs_review | failed | urgent
review_status           enum: none | pending | approved | changes_requested
schedule_type           enum: none | one_time | recurring
schedule_rule           text (cron or ISO datetime)
schedule_summary        text (human-readable)
timezone                text (IANA)
next_occurrence_at      timestamp
max_occurrences         integer
occurrence_count        integer DEFAULT 0
latest_execution_status enum (denormalized from latest occurrence)
latest_result_summary   text
latest_error_summary    text
delivery_targets        jsonb (where to send results)
source_conversation_id  text (originating conversation)
due_date                timestamp
priority                integer DEFAULT 0
parent_id               FK → tasks (self-ref, subtask hierarchy)
flag_color              enum
is_pinned               boolean
sort_order              double precision
processing_enabled      boolean (AI tag generation)
processing_status       enum
completed_at            timestamp
created_at              timestamp
updated_at              timestamp
search_vector           tsvector (generated)
```

### `task_occurrences` table

```
id                      text PK
task_id                 FK → tasks
user_id                 FK → users
kind                    enum: manual_run | scheduled_run | recurring_run | reminder | review_run
scheduled_for           timestamp
started_at              timestamp
completed_at            timestamp
duration_ms             integer
execution_status        enum (same as ExecutionStatus)
prompt                  text (per-occurrence override)
result_summary          text
result_body             text
error_body              text
requires_review         boolean
review_status           enum
executor_actor_id       FK → actors
requested_by_actor_id   FK → actors
token_usage             jsonb
delivery_result         jsonb
retry_of_occurrence_id  FK → task_occurrences (self-ref)
metadata                jsonb
created_at              timestamp
```

### Removed tables

- `task_series` → absorbed into tasks (schedule_type=recurring)
- `scheduled_actions` → absorbed into tasks (schedule_type + delivery_targets)
- `scheduled_action_executions` → absorbed into task_occurrences
- `agent_runs` → absorbed into task_occurrences

### Unchanged tables

- `task_comments`
- `tags` + `tasks_tags` (junction table pattern, consistent with all assets)

## Differences From Original Spec

The original spec used `owner_actor_id` for the task owner. The implementation uses `user_id` (the authenticated user who owns the task), consistent with all other entities in the codebase. The delegate is `delegate_actor_id`.

The original spec proposed `task_participants` and `agent_execution_traces` / `agent_execution_steps` tables. These are not implemented — participation and execution traces can be added later as needed.

The original spec proposed an owner/delegate naming where both are actor IDs. The implementation keeps `user_id` (the user) and `delegate_actor_id` (the actor doing the work), with `delegated_by_actor_id` for agent-to-agent delegation chains.

## Implemented API

### Tasks

```
GET    /api/tasks                     — list/search with filters (taskStatus, attentionStatus, scheduleType, delegateMode, text, tags, etc.)
POST   /api/tasks                     — create (handles all types via properties)
GET    /api/tasks/:id                 — get single task
PUT    /api/tasks/:id                 — full update
PATCH  /api/tasks/:id                 — partial update
DELETE /api/tasks/:id                 — delete

GET    /api/tasks/:id/occurrences     — occurrence history (cursor-paginated)
POST   /api/tasks/:id/start           — trigger immediate execution
POST   /api/tasks/:id/retry           — retry failed occurrence (optional edited prompt)
POST   /api/tasks/:id/cancel          — cancel current occurrence
POST   /api/tasks/:id/pause           — pause recurrence
POST   /api/tasks/:id/resume          — resume recurrence
POST   /api/tasks/:id/approve         — approve agent result
POST   /api/tasks/:id/request-changes — request changes on result
POST   /api/tasks/:id/respond         — respond to agent question

GET    /api/tasks/:id/comments        — comments
POST   /api/tasks/:id/comments        — add comment
PUT    /api/tasks/:id/comments/:cid   — update comment
DELETE /api/tasks/:id/comments/:cid   — delete comment

PATCH  /api/tasks/:id/review          — update review status
PATCH  /api/tasks/:id/flag            — update flag color
PATCH  /api/tasks/:id/pin             — toggle pin
POST   /api/tasks/:id/reprocess       — reprocess AI tags
```

### Inbox

```
GET    /api/tasks/inbox               — attention queue (grouped by section)
```

Response shape:

```ts
{
  sections: {
    needsReview:   InboxTask[],
    waitingOnYou:  InboxTask[],
    failed:        InboxTask[],
    needsTriage:   InboxTask[],
    urgent:        InboxTask[],
  },
  totalCount: number,
}
```

### Removed API routes

- `/api/scheduled-actions/*`
- `/api/task-series/*`
- `/api/upcoming`

## Implemented Agent Tools

| Tool | Purpose |
|------|---------|
| `createTask` | Create any task type via properties (reminders, recurring, agent work, manual) |
| `updateTask` | Update task properties (status, delegate, schedule, etc.) |
| `deleteTask` | Delete a task |
| `findTasks` | Search with filters (taskStatus, attentionStatus, scheduleType, delegateMode, tags, text) |
| `getTask` | Get single task |
| `countTasks` | Count matching tasks |
| `addTaskComment` | Add comment to task |
| `getTaskComments` | Get task comments |

### Removed tools

- `scheduleAction` → absorbed into `createTask` (scheduleType + deliveryTargets)
- `createTaskSeries` → absorbed into `createTask` (scheduleType=recurring)
- `runTaskAgent` → replaced by `startTask` action endpoint
- `listScheduledActions` → absorbed into `findTasks` (scheduleType filter)
- `listTaskSeries` → absorbed into `findTasks` (scheduleType=recurring)
- `manageTaskSeries` → absorbed into `updateTask` (pause/resume via scheduleType)
- `cancelScheduledAction` → absorbed into cancel action endpoint

## Implemented Frontend

### Navigation

```
├─ Inbox (with attention badge)
├─ Tasks
├─ ─────
├─ Notes, Bookmarks, Documents, Photos, Media, History
```

Removed: Upcoming, By Actor, Automations, Task Series (5 items → 2).

### Pages

| Route | Component | Status |
|-------|-----------|--------|
| `/inbox` | InboxPage | Implemented — sectioned attention queue with approve/retry/cancel actions |
| `/tasks` | TasksPage | Updated — new field names, saved view filters |
| `/tasks/:id` | TaskDetailPage | Updated — schedule info, removed linked automations and agent run history sections |

### Removed pages

- `/automations`, `/automations/:id`
- `/task-series`, `/task-series/:id`
- `/upcoming`
- `/by-actor` (route files kept but nav link removed; can become a saved view)

## Implemented Workers

Single `taskOccurrenceProcessor` replaces three old processors:
- Idempotency check before execution
- Reminder kind → notification delivery (TODO: wire channel adapters)
- Agent execution kinds → `processPromptRequest` with 5-minute timeout
- Review gate: `assist` mode → sets `attention_status=needs_review`, `review_status=pending`
- Auto-complete: `handle` mode → marks task completed
- Agent output posted as task comment
- Denormalized status updates on task after each occurrence

## Inbox State Machine

Stored `attention_status` field, updated by transitions:

```
Task created by user              → none
Task created by agent/chat        → needs_triage
User triages (accept/assign)      → none

Occurrence → awaiting_input       → awaiting_input
User responds                     → none

Occurrence completes + review     → needs_review
User approves                     → none (task completed)
User requests changes             → none (new occurrence may be created)

Occurrence fails                  → failed
User retries/cancels              → none

Due date passes (open task)       → urgent
Task completed/cancelled          → none
```

### Precedence (when multiple reasons could apply)

1. needs_review (most actionable)
2. awaiting_input
3. failed
4. needs_triage
5. urgent (least actionable)

## Remaining Work

### Done

- ~~**Recurring task scheduler integration**~~: `createTask` with `scheduleType=recurring` registers a cron schedule via `scheduler.upsert()`. New `task-schedule-tick` queue and `taskScheduleTickProcessor` create occurrences on each tick, increment `occurrenceCount`, advance `nextOccurrenceAt`, and auto-remove the schedule at `maxOccurrences`. `pauseTask`/`resumeTask` disable/enable the schedule. `deleteTask` and `updateTask` clean up schedules.
- ~~**One-time scheduled execution**~~: `createTask` with `scheduleType=one_time` auto-creates a delayed `TaskOccurrence`. Fixed `scheduledFor` passthrough bug in `createTaskOccurrence` — both BullMQ (delay) and database (runAt) adapters now receive it.
- ~~**Reminder notification delivery**~~: `processReminder()` in `taskOccurrenceProcessor` now delivers via `channelRegistry` + `getNotificationChannels()` (Telegram, Discord, Slack). Results stored via `setDeliveryResult()`. Graceful fallback when no channels configured.
- ~~**Frontend route tree regeneration**~~: Already done — `routeTree.gen.ts` includes `/inbox`.
- ~~**Inbox badge count**~~: `NavItem` supports `badge` prop. `useInboxCount()` polls `/api/tasks/inbox` every 30s. Red pill badge on Inbox nav item.
- ~~**Saved views**~~: Quick-filter tabs on TasksPage: All, Assigned to Me, Agent Tasks, Needs Review, Recurring, Done. Added `titleExtra` prop to `ListPageLayout`.
- ~~**Task detail occurrence history**~~: `TaskExecutionHistory` component added to TaskDetailPage sidebar for non-manual tasks.
- ~~**`due_date` → `urgent` attention cron**~~: `taskOverdueCheckerProcessor` runs every 15 minutes via system cron registered on startup. Batch-updates overdue active tasks to `attention_status=urgent`.
- ~~**`TaskExecutionHistory` component**~~: Rewritten — uses `TaskOccurrence` type, shows kind icons, all execution statuses, expandable details.
- ~~**`use-task-executions` hook**~~: Rewritten as `useTaskOccurrences` — fetches from `/api/tasks/:id/occurrences`, uses `TaskOccurrence` type.

### Done — Tests

- ~~**Integration test rewrites**~~: Removed `@ts-nocheck` from all 5 files (`tasks.crud`, `tasks.extended`, `tasks.comments`, `tasks.recurrence`, `tasks.search`). Fixed field names (`status`→`taskStatus`, etc.). Fixed `processingStatus` null coercion bug and tag filter 500 bug found during testing.
- ~~**New integration tests**~~:
  - `tasks.actions.test.ts` (28 tests): Agent auto-execution, delegateMode auto-upgrade, approve/request-changes (with occurrence-level reviewStatus verification), start/cancel, retry with prompt, inbox state machine (all 5 sections), respond side-effects (comment + attention clear), handle mode auto-complete, delegate changes, occurrence history + pagination.
  - `tasks.scheduling.test.ts` (5 tests): One-time delayed execution, due date + recurrence combo, completed task history preservation.
  - `tasks.edge-cases.test.ts` (5 tests): Cancel recurring occurrence, running agent + due date, archive triage, completed recurring task, overdue checker precedence rules (tests all 5 attention statuses + completed/cancelled exclusion).
  - `tasks.recurrence.test.ts` (14 tests): Creation (cron, maxOccurrences, daily, weekly), validation, pause/resume, occurrence tracking, schedule pattern update (cron change + de-schedule), maxOccurrences runtime enforcement, deletion cleanup.
- ~~**New unit tests**~~:
  - `task-scheduling.test.ts` (26 tests): Schedule/delegate/attention/review schema validation, cron utilities (`isValidCronExpression`, `getNextExecutionTime`, `describeCronExpression`).
  - `taskOccurrenceProcessor.test.ts` (12 tests): Idempotency guard, assist mode (review gate, SSE events, comment posting), handle mode (auto-complete, no review), error handling (failure marking, attention status), reminder delivery (channels, no-channel fallback), prompt resolution (occurrence → task → title fallback).
  - `taskScheduleTickProcessor.test.ts` (14 tests): Task validation (not found, not recurring, blocked, completed, cancelled), kind determination (recurring_run vs reminder, agent priority), occurrence creation + count increment, nextOccurrenceAt computation, maxOccurrences enforcement (schedule removal at limit).

### Test Coverage vs QA Scenarios

| Covered | Scenarios |
|---------|-----------|
| **Tested** | #1-8, #12, #15-28, #29-30, #31, #34, #36-39, #41-43, #51-56 (46 of 59) |
| **Not implemented** (Nice to Have) | #9-11 (reminders via chat), #13-14 (agent-created tasks), #32-33 (approval gate), #40 (snooze), #44-50 (inbox search/filter/mobile/keyboard) |
| **Not applicable** | #35 (repeated failures — would need to simulate agent errors) |

### Remaining Test Work

- **Agent tool integration tests** (`tasks.agent-tools.test.ts`): Call `createTask` tool with agent context → verify `delegatedByActorId` set (#53). Call `addTaskComment` tool → verify `userType=assistant`. Call `findTasks` tool → verify user scoping.
- **By-actor endpoint** (#57): Create tasks with different delegates, call `GET /api/tasks/by-actor`, verify grouped counts.
- **Reminder delivery e2e** (#58): Create one-time task with `deliveryTargets`, verify occurrence kind is `reminder`. Full delivery needs channel mocking.
- **History recording verification**: Create/update/delete a task, query history table, verify entries with correct `beforeData`/`afterData`.
- **`updateTaskStatusAsAssistant` authorization**: Verify throws when caller is not the assigned delegate; succeeds when it matches.
- **Delete recurring task cleanup**: Create recurring task, delete it, verify no further ticks fire.

### Nice to Have

- **Inbox keyboard shortcuts**: `a` approve, `r` retry, `e` edit, arrow keys navigate, as described in original spec.
- **Inbox search and filters**: Search across inbox items by title, error text, tags.
- **Inbox preview pane**: Desktop split view with list on left, detail preview on right.
- **Task detail source-aware back navigation**: "Back to Inbox" vs "Back to Tasks" depending on where user came from.
- **Snooze**: Temporarily clear `urgent` attention status with a future re-trigger.
- **`task_participants` table**: For multi-user collaboration on tasks.
- **External delivery actions**: Webhook, email, channel_post delivery targets for occurrence results.
- **Operational policies**: `missedRunPolicy`, `concurrencyPolicy`, `failurePolicy` for recurring tasks.
- **Conditional triggers**: Cancel follow-up if reply arrives, event-driven scheduling.
- **Real-time updates**: SSE for live occurrence status changes (currently polling at 30s in inbox).

## Key Files

| Area | Files |
|------|-------|
| **DB Schema** | `packages/db/src/schema/postgres.ts`, `sqlite.ts` |
| **Core Types** | `packages/core/src/types.ts` |
| **API Types** | `packages/api-types/src/tasks.ts` |
| **Task Service** | `apps/backend/src/lib/services/tasks.ts` |
| **Occurrence Service** | `apps/backend/src/lib/services/task-occurrences.ts` |
| **Occurrence Processor** | `apps/backend/src/workers/jobs/taskOccurrenceProcessor.ts` |
| **Schedule Tick Processor** | `apps/backend/src/workers/jobs/taskScheduleTickProcessor.ts` |
| **Overdue Checker** | `apps/backend/src/workers/jobs/taskOverdueCheckerProcessor.ts` |
| **Scheduler** | `apps/backend/src/lib/queue/scheduler.ts` |
| **Cron Utils** | `apps/backend/src/lib/queue/cron-utils.ts` |
| **Task Routes** | `apps/backend/src/routes/tasks.ts` |
| **Task Params Schema** | `apps/backend/src/schemas/tasks-params.ts` |
| **System Prompt** | `apps/backend/src/lib/agent/system-prompt-builder.ts` |
| **Agent Tools** | `apps/backend/src/lib/agent/tools/create-task.ts`, `update-task.ts`, `find-tasks.ts`, `count-tasks.ts` |
| **Queue Types** | `apps/backend/src/lib/queue/types.ts` |
| **Queue Names** | `apps/backend/src/lib/queue/queue-names.ts` |
| **Worker Registration** | `apps/backend/src/workers/index.ts`, `workers/lib/direct-db-workers.ts` |
| **App Startup** | `apps/backend/src/index.ts` (scheduler start, overdue cron registration) |
| **Frontend Types** | `apps/frontend/src/types/task.ts` |
| **Frontend Hooks** | `apps/frontend/src/hooks/use-tasks.ts`, `hooks/use-task-executions.ts` |
| **Inbox Page** | `apps/frontend/src/components/pages/InboxPage.tsx` |
| **Task Detail** | `apps/frontend/src/components/pages/TaskDetailPage.tsx` |
| **Task List** | `apps/frontend/src/components/pages/TasksPage.tsx` |
| **Execution History** | `apps/frontend/src/components/pages/tasks/TaskExecutionHistory.tsx` |
| **Task Utils** | `apps/frontend/src/components/pages/tasks/task-utils.ts` |
| **Navigation** | `apps/frontend/src/components/dashboard/main-layout-client.tsx` |
| **Sidebar** | `apps/frontend/src/components/sidebar/content-sidebar.tsx` |
| **List Page Layout** | `apps/frontend/src/components/list-page/ListPageLayout.tsx` |
| **ID Generator** | `packages/core/src/id-generator.ts` |

## Scenario Matrix For QA

Each scenario should be tested for task creation, task list visibility, inbox visibility, detail page state, occurrence history, retry/cancel behavior, and notifications where relevant.

| # | Scenario | Expected Tasks View | Expected Inbox | Expected Lifecycle |
|---|---|---|---|---|
| 1 | User creates a plain manual task | Appears in `/tasks` | Not in inbox unless triage required | `open` |
| 2 | User creates a plain manual task with due date | Appears in `/tasks` | Appears in `Urgent` when due or overdue | `open -> completed` |
| 3 | User creates a task and delegates to a human | Appears in `/tasks` | Optional `Needs triage` if acceptance required | human workflow |
| 4 | User creates a task and delegates to an agent, start now | Appears in `/tasks` | Appears in `Needs review` if review required | `queued -> running -> awaiting_review/completed` |
| 5 | User creates a task and delegates to an agent in assist mode | Appears in `/tasks` | Appears in `Needs review` only if requested | feedback or assist output |
| 6 | User creates a task and schedules agent execution for one time | Appears in `/tasks` | No inbox until attention is required | `scheduled -> queued -> running` |
| 7 | User creates a recurring daily 8am agent task | Appears in `/tasks`, `Recurring` view | Only appears when an occurrence needs attention | recurring occurrences |
| 8 | User creates a recurring daily 8am human task | Appears in `/tasks`, `Recurring` view | Appears in `Urgent` when due or overdue | recurring human occurrences |
| 9 | User creates a reminder-only task for 2pm | Appears in `/tasks` | Appears in `Urgent` near trigger if unresolved | reminder occurrence |
| 10 | User asks in chat: remind me at 2pm | Task is created and visible in `/tasks` | Same as reminder-only | reminder occurrence |
| 11 | User asks in chat: have agent summarize tasks every morning | Task is created and visible in `/tasks`, `Recurring` | Inbox only when review/failure/input is needed | recurring agent occurrences |
| 12 | User asks agent to review an existing task | Existing task remains in `/tasks` | Appears in `Needs review` when result arrives | review occurrence |
| 13 | Agent creates a follow-up task suggestion | New task in `/tasks` | Appears in `Needs triage` | active task awaiting decision |
| 14 | Agent creates a child task automatically | Child task in `/tasks` | Appears in `Needs triage` if confirmation required | child task created |
| 15 | Agent asks the user for clarification | Task remains in `/tasks` | Appears in `Waiting On You` | `awaiting_input` |
| 16 | User responds to clarification request | Task remains in `/tasks` | Leaves inbox if no attention remains | `awaiting_input -> queued/running` |
| 17 | Agent run fails once | Task remains in `/tasks` | Appears in `Failed` | `running -> failed` |
| 18 | User retries failed occurrence | Task remains in `/tasks` | Leaves or remains in `Failed` depending on retry outcome | new retry occurrence |
| 19 | User retries failed occurrence with edited instructions | Same | Same | retry occurrence with edited input |
| 20 | User cancels queued agent run | Task remains in `/tasks` | Leaves inbox unless more attention remains | occurrence `cancelled` |
| 21 | User cancels one future recurring occurrence | Task remains in `/tasks`, `Recurring` | No inbox entry for cancelled future occurrence | one occurrence cancelled |
| 22 | User pauses recurrence | Task remains in `/tasks`, `Recurring` with paused state | Not in inbox unless paused state itself requires action | recurrence paused |
| 23 | User resumes recurrence | Task remains in `/tasks`, `Recurring` | Inbox unchanged unless next occurrence becomes urgent | recurrence resumed |
| 24 | Agent completes task and review is required | Task remains in `/tasks` | Appears in `Needs review` | `awaiting_review` |
| 25 | User approves agent result | Task remains in `/tasks`, usually completed | Leaves `Needs review` | `approved -> completed` |
| 26 | User requests changes on agent result | Task remains in `/tasks` | Leaves `Needs review`, may re-enter later | `changes_requested` then rerun |
| 27 | Agent result arrives on recurring occurrence requiring per-run review | Parent task in `/tasks`, `Recurring` | Appears in `Needs review` | reviewed recurring occurrence |
| 28 | Agent result arrives on recurring occurrence with no review required | Parent task in `/tasks`, `Recurring` | No inbox unless other attention exists | completed recurring occurrence |
| 29 | Overdue manual task assigned to user | Appears in `/tasks` | Appears in `Urgent` | active overdue task |
| 30 | Due-today delegated human task owned by user | Appears in `/tasks` | Appears in `Urgent` if unresolved | active due task |
| 31 | Due-today delegated agent task currently running | Appears in `/tasks` | Not in `Urgent` unless user action is required | running task |
| 32 | Agent requires approval before external action | Task remains in `/tasks` | Appears in `Waiting On You` | approval gate |
| 33 | User denies requested approval | Task remains in `/tasks` | Leaves or changes section depending on resulting state | denied path |
| 34 | Agent loses permission or tool access mid-run | Task remains in `/tasks` | Appears in `Failed` | blocked/failure state |
| 35 | Recurring occurrence fails repeatedly | Parent task remains in `/tasks`, `Recurring` | Appears in `Failed` | repeated failed occurrences |
| 36 | User reassigns failed agent task to another agent | Task remains in `/tasks` | Leaves `Failed` if new run is queued successfully | delegate changed |
| 37 | User converts human task to delegated agent task | Same task in `/tasks` | Appears in inbox only when attention exists | delegate added |
| 38 | User converts delegated agent task back to manual or human | Same task in `/tasks` | Agent-specific inbox states clear when resolved | delegate removed |
| 39 | User creates a task with both due date and recurrence | Appears in `/tasks`, `Recurring` | Inbox follows precedence rules | recurring parent plus occurrences |
| 40 | User snoozes urgent reminder or task | Task remains in `/tasks` | Leaves `Urgent` until new time | due adjusted |
| 41 | User archives triage item | Task hidden from default active views as defined | Leaves `Needs triage` | archived/cancelled behavior |
| 42 | Completed task with historical occurrences | Appears in `Done` | Not in inbox | history preserved |
| 43 | Completed recurring task template paused permanently | Appears in `Done` or archived recurring view | Not in inbox | inactive recurring task |
| 44 | Search in inbox finds task by title | Also present in `/tasks` | Matching inbox item returned | no state change |
| 45 | Search in inbox finds task by latest error text | Also present in `/tasks` | Matching failed item returned | no state change |
| 46 | Filtering inbox by assigned-to-agent | Tasks unaffected | Only agent-delegated inbox items visible | no state change |
| 47 | Filtering tasks by assigned-to-me excludes unrelated triage items | Correctly filtered in `/tasks` | Inbox still shows attention items | no state change |
| 48 | Mobile inbox opens preview sheet | Same data as desktop | Actions available in sheet | no state change |
| 49 | Keyboard actions approve, retry, or edit focused inbox item | Same task also exists in `/tasks` | Item moves sections or leaves inbox appropriately | action-specific |
| 50 | Notification click deep-links into selected inbox item | Task also available in `/tasks` | Inbox opens correct section and selection | no state change |
| 51 | User creates task with delegateMode=handle (full automation) | Appears in `/tasks` | NOT in inbox (auto-completes) | `queued -> running -> completed` (no review gate) |
| 52 | User responds to agent's awaiting_input question | Task in `/tasks` | Leaves `Waiting On You` | Response saved as comment, `attentionStatus` cleared |
| 53 | Agent creates a task via createTask tool (delegation chain) | Appears in `/tasks` with `delegatedByActorId` set | Appears in `Needs triage` | agent-to-agent delegation |
| 54 | Recurring task reaches maxOccurrences limit | Task in `/tasks`, `Recurring` | No further inbox entries | Schedule removed, no new occurrences |
| 55 | User updates cron pattern on existing recurring task | Task in `/tasks`, `Recurring` | Unchanged unless attention needed | `scheduleRule` updated, `nextOccurrenceAt` recomputed |
| 56 | Overdue checker respects attention precedence | Tasks with various statuses | Only `none`/`needs_triage` → `urgent`; `awaiting_input`/`needs_review`/`failed` unchanged | completed/cancelled excluded |
| 57 | By-actor endpoint groups task counts by delegate | Available via API | N/A | no state change |
| 58 | Reminder delivery via notification channels | Task in `/tasks` | `needs_triage` if no channels configured | Delivery results tracked on occurrence |
| 59 | Pause/resume verifies taskStatus and nextOccurrenceAt | Task in `/tasks`, `Recurring` | No inbox unless attention needed | `blocked`/`open` transitions, `nextOccurrenceAt` cleared/recomputed |
