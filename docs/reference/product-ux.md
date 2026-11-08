> **Non-normative reference.** Extracted from Eclaire v0.7 to preserve user intent and hard-won lessons. `PRD.md` is the source of truth. Do not reproduce v0.7's structure, module layout or naming; where this document and the PRD disagree, the PRD wins. "Better options today" are leads to evaluate, not decisions.

Labels: **[Fact]** external truth, keep. **[Rule]** a requirement we want, mirrored in PRD Appendix C. **[v0.7 choice]** inventory only, free to change. UI sections list **capabilities**; v0.7's UI specifics live in Appendix A and are not design input.

# Product behaviours, UX, channels, onboarding and ops (v0.7 reference)

Scope: task semantics, item metadata and views, assistant UX, keyboard and upload behaviour, chat channels (non-voice), notifications, onboarding, settings, admin/ops, desktop and CLI. Voice audio is covered elsewhere.

Conventions: "v0.7" means Eclaire v0.7 at `main@8cd0fda`. Values are as found in code unless marked "(inferred)".

---

## 1. Tasks

### Task status
- **User intent:** a simple, familiar lifecycle for both human and agent work.
- **Observations:** (v0.7 UI specifics: Appendix A.1)
  - **[v0.7 choice]** Five values with these display labels: `open` = "Not Started", `in_progress` = "In Progress", `blocked` = "Blocked", `completed` = "Completed", `cancelled` = "Cancelled". The default was `open`. Replaced by the PRD status set ([TASK-1]).
  - **[v0.7 choice]** A task could not be created as `cancelled`; that status was offered only on edit.
  - **[Rule RULE-UX-1]** A task MUST be completable, and a completed task reopenable, in one action from any list that shows it. One-click completion from a list was the most-used interaction.
  - **[v0.7 choice]** The list checkbox flipped any status to `completed`, and `completed` back to `open`.
  - **[v0.7 choice]** `completedAt` was stamped on the first transition into `completed`, kept if the task was re-saved while completed, and cleared when the task left `completed`.
  - **[Rule RULE-UX-2]** When the system is waiting on a human (a review, an approval, a question), the subject MUST be shown as waiting on the user, never with a busy or progress indicator.
  - **[v0.7 choice]** An `in_progress` task whose review was pending was displayed as "Awaiting Review" instead of a spinner.
  - **[v0.7 choice]** `blocked` was overloaded to mean "recurring task paused": pause set the status to `blocked`, resume set it back to `open`. Replaced by RULE-UX-3.
  - **[Rule RULE-UX-3]** Pausing recurring work MUST be a property of its trigger and MUST NOT change the task's status; "paused" and "blocked" MUST NOT share a representation.
- **How v0.7 did it (non-normative):** a fixed status enum on the task row, plus a separate execution status taken from the latest run.
- **Known problems in v0.7:**
  - Using `blocked` for "paused" conflated two meanings. A genuinely blocked recurring task stopped firing.
  - The "by actor" view counted `in-progress` (hyphen) against `in_progress` data, so those counts were always zero.
- **Better options today:** Linear-style status categories (backlog / todo / in progress / done / cancelled) with per-space custom statuses inside them. Pause is a property of the *trigger*, not a task status.
- **PRD refs:** [TASK-1] (statuses `todo, in_progress, blocked, done, cancelled`; custom statuses P1), [TASK-1a], [TASK-3].

### Priority scale
- **User intent:** Linear-compatible priority that sorts sensibly.
- **Observations:**
  - **[v0.7 choice]** Integers 0–4: `0` = None (no icon), `1` = Urgent (warning-triangle icon, red), `2` = High (up arrow, orange), `3` = Medium (dash, yellow), `4` = Low (down arrow, blue). The default was 0.
  - **[v0.7 choice]** Agent tools exposed the same 0–4 scale with these labels.
  - **[Rule RULE-UX-4]** Sorting by priority MUST place "no priority" after every set priority, whatever value it is stored as.
- **How v0.7 did it (non-normative):** an integer column with label and icon maps in the client.
- **Known problems in v0.7:** a plain numeric sort puts None (0) ahead of Urgent (1) (inferred).
- **Better options today:** keep Linear's exact scale and iconography; users of Linear will recognise it immediately.
- **PRD refs:** [TASK-1] `priority`, [TASK-1a].

### Delegate modes (manual, assist, handle)
- **User intent:** one task model covers "I do it", "the agent does it and I check", and "the agent does it and closes it".
- **Observations:** (v0.7 UI specifics: Appendix A.1)
  - **[v0.7 choice]** `manual`: the human assignee did the work. No runs, no review. Kept as `manual` ([TASK-1]).
  - **[v0.7 choice]** `assist`: an agent ran. On success the result went to review (review state `pending`, attention "needs review"), and the task was *not* completed until approved. Kept as `assist`, with a `review` attention item ([TASK-2]).
  - **[v0.7 choice]** `handle`: an agent ran and the task auto-completed on success. Replaced by `autonomous` ([TASK-1]), under which a recurring task remains active ([TASK-2]).
  - **[v0.7 choice]** Defaulting: no assignee → `manual`; assigned to an agent with no mode, or with `manual` → `assist`.
  - **[Rule RULE-UX-5]** When a human assigns a task to an agent without choosing a mode, the mode MUST default to human review (`assist`), never to autonomous completion.
  - **[v0.7 choice]** New agent-delegated tasks were created with review state `pending`; manual tasks with `none`.
  - **[v0.7 choice]** The mode was presented as a single review checkbox, shown only when the assignee was an agent.
  - **[v0.7 choice]** Creating an agent-delegated task with no schedule **auto-started a run immediately**. Its status became `in_progress` and its execution status `queued`. Replaced by an Agent Run linked to the task ([TASK-2]).
  - **[v0.7 choice]** The agent's text output was posted as a **task comment attributed to the agent** ([ORG-4]). An empty output skipped the comment, and the review banner then pointed the user to the execution history.
  - **[v0.7 choice]** A human comment on a delegated task (one with no run queued or running) started a new revision run on the same task. Its default prompt was "Revise the task: <title>". This is how "request changes" actually worked. Replaced by an explicit request-changes action ([TASK-2], RULE-UX-6).
  - **[v0.7 choice]** Agent runs had a hard 5-minute timeout, and a timeout counted as a failed run (starting point; tune).
  - **[v0.7 choice]** Effective prompt order: the occurrence prompt, then the task's instructions, then `Work on the task: <title>`. The task description was passed as context.
- **How v0.7 did it (non-normative):** a delegate actor id and mode on the task. Each execution was an "occurrence" row, processed by one worker.
- **Known problems in v0.7:**
  - A `handle` run set the task to `completed` even when the task was recurring, and the schedule tick skipped completed tasks. So **recurring handle-mode tasks stopped after their first run**. The rule to keep is the PRD's: a recurring task remains active.
  - The run used the chat prompt pipeline with the task's source conversation, so task runs polluted chat threads.
  - The run's state lived in memory. A crash or restart during the 5-minute window lost it.
- **Better options today:** model the run as a durable Agent Run linked to the task (PRD). Idea: show assignee avatars for agents and humans alike, as Linear does for its agent assignees.
- **PRD refs:** [TASK-1] `delegation_mode` (`autonomous` replaces `handle`), [TASK-2], [PRIN-4].

### Review flow (approve / request changes)
- **User intent:** a human gate on agent output, operable from anywhere.
- **Observations:** (v0.7 UI specifics: Appendix A.1)
  - **[v0.7 choice]** Review states `none`, `pending`, `approved`, `changes_requested`, tracked both on the task and on each occurrence. Kept as `review_state` ([TASK-1]).
  - **[v0.7 choice]** Approve set the review to `approved`, cleared attention, set the task `completed`, stamped the completion time, and marked the pending occurrence `approved`.
  - **[v0.7 choice]** Request changes set the review to `changes_requested` and cleared attention. Its Inbox "button" only navigated to the task, where the user wrote a comment. The comment triggered a revision run (see Delegate modes), which re-entered review if the mode was still `assist`.
  - **[Rule RULE-UX-6]** "Request changes" MUST be one explicit action that carries the user's feedback and starts the revision run. An ordinary comment MUST NOT start an agent run.
  - **[v0.7 choice]** The task detail page showed a review banner with the latest result summary and an Approve button. Delegated tasks showed comments and execution history; manual tasks showed comments only.
- **How v0.7 did it (non-normative):** separate approve and request-changes actions over REST; feedback was a plain comment.
- **Known problems in v0.7:**
  - "Request changes" carried no feedback payload, and the run it triggered was implicit (any human comment). Users could trigger runs by accident.
  - The review summary was truncated to 500 characters, so long results needed a second click.
- **Better options today:** a first-class review attention item with Approve and "Request changes" + feedback in one action, available inline in the Inbox, in notifications and in chat channels (buttons). Idea: diff-style display of deliverable changes between runs.
- **PRD refs:** [TASK-1] `review_state`, [TASK-2], [ORG-5] `review`, [CHAN-5].

### Attention statuses (v0.7) and what set them
- **User intent:** a single "what needs me" signal per task, feeding the Inbox.
- **Observations:**
  - **[v0.7 choice]** One attention status per task, with these values. The whole concept is replaced by PRD attention items ([ORG-5]):

    | Status | Set when | Cleared when | Inbox reason text |
    |---|---|---|---|
    | `needs_review` | an assist-mode run completed | approve, or request changes | "Agent completed work and needs approval" |
    | `awaiting_input` | intended for an agent asking a question. **Nothing set it in v0.7.** | the user replied (the reply was stored as a comment) | "Agent needs your answer" |
    | `failed` | any run threw (including the timeout); the error summary was kept to 500 characters | retry, or cancel | "Latest run failed" |
    | `needs_triage` | a reminder fired but **no notification channel existed**, so the user would otherwise never know | (no explicit action) | "New task awaiting triage" |
    | `urgent` | the overdue checker found a due date in the past (see Overdue) | (nothing cleared it) | "Due <ISO date>" |

  - **[v0.7 choice]** Precedence: the overdue checker only overwrote `none` or `needs_triage`. Review, failed and awaiting-input outranked overdue.
  - **[Rule RULE-UX-7]** State derived from runs (a task's "latest result", status or attention) MUST be updated only from the most recent run, so an older concurrent run can never overwrite a newer result. v0.7 applied this guard to its denormalised fields.
- **How v0.7 did it (non-normative):** one enum column per task, so a task could hold only one attention reason at a time.
- **Known problems in v0.7:**
  - With a single slot, attention reasons overwrote each other.
  - `urgent` was never cleared on completion or when the due date moved, so completed tasks lingered in the Inbox (inferred from the absence of any clearing path).
  - `awaiting_input` was dead.
  - The "no channels configured" case was mislabelled as triage.
- **Better options today:** PRD attention items, many per subject, each with its own resolution. Use a distinct type for "delivery failed / no target", e.g. a `failure` attention item.
- **PRD refs:** [ORG-5] replaces this whole concept (types `approval, review, triage, failure, due, overdue, question, mention`); Appendix A.

### Inbox sections and rules
- **User intent:** one place listing everything that needs the user, with a one-click action for each.
- **Observations:** (v0.7 UI specifics: Appendix A.2)
  - **[v0.7 choice]** Membership: every task whose attention ≠ none, ordered by last update (newest first). Tasks only; other kinds never appeared. Replaced by attention items over any subject ([ORG-5]).
  - **[v0.7 choice]** Section order and actions:
    1. **Needs Review**: Approve (inline), Request Changes (opens the task).
    2. **Waiting on You**: Reply (opens the task).
    3. **Failed**: Retry (inline; creates a new manual run, optionally with an edited prompt), Cancel (inline; cancels queued or running occurrences).
    4. **Needs Triage**: Open.
    5. **Urgent**: Open.
- **How v0.7 did it (non-normative):** a server endpoint grouped tasks by attention status into fixed sections.
- **Known problems in v0.7:**
  - No bulk actions.
  - Not kind-generic (new captures went to a different "Pending" view).
  - Request Changes and Reply only navigated away instead of acting inline.
- **Better options today:** Idea: Linear Inbox and GitHub notifications patterns: keyboard triage (j/k, e to resolve, snooze), bulk select, and per-item inline actions. Sections are derived from attention-item types.
- **PRD refs:** [ORG-5], [ORG-6] Inbox, [WEB-2] counts, [WEB-9] "needs review".

### Overdue logic
- **User intent:** overdue work surfaces without the user having to look for it.
- **Observations:**
  - **[v0.7 choice]** A system cron ran **every 15 minutes** (6-field cron `0 */15 * * * *`) (starting point; tune). Replaced by a built-in system automation ([TASK-5]).
  - **[v0.7 choice]** Selection rule: the due date is ≤ now, the status is not `completed` or `cancelled`, and the attention status is `none` or `needs_triage`. Matching tasks were set to `urgent` in one batch update, followed by one realtime event per user. Replaced by `due` and `overdue` attention items ([ORG-5]).
  - **[v0.7 choice]** The cross-item "Due Now" view used a different rule: due ≤ end of today (23:59:59). "Overdue" there meant before the start of today, and "due today" meant between 00:00 and 23:59:59.
  - **[v0.7 choice]** These day boundaries were computed in the **server's** time zone, not the user's. Replaced by RULE-UX-8.
  - **[Rule RULE-UX-8]** Date logic the user sees (due today, overdue, schedule fire times, relative times such as "tomorrow at 9") MUST be evaluated in the user's (or space's) time zone, never the server's, and "overdue" MUST mean the same thing on every surface.
  - **[Rule RULE-UX-9]** Due and overdue attention MUST resolve automatically when the task is completed or cancelled, or when its due date moves out of range.
- **How v0.7 did it (non-normative):** a special-cased system job, plus date-range filters on list queries.
- **Known problems in v0.7:**
  - Two different notions of overdue: the task cron used "now", the views used "today".
  - Day boundaries used the server time zone.
  - The check had 15-minute granularity.
  - The flag never reset.
- **Better options today:** overdue as a built-in system automation (PRD) emitting `due` and `overdue` attention items. Evaluate the time from the user's (or space's) time zone; RRULE/Temporal-based date maths.
- **PRD refs:** [TASK-5], [ORG-5] `due`/`overdue`, [ORG-6] "Due soon" and "Overdue" as separate views.

### Occurrence kinds and execution status
- **User intent:** every firing of a task (a run, a scheduled run, a reminder, a revision) leaves an auditable record with its result and delivery outcome.
- **Observations:**
  - **[v0.7 choice]** Kinds: `manual_run` (Start or Retry, or auto-start on agent delegation), `scheduled_run` (a one-time date-time), `recurring_run` (a cron tick), `reminder` (a notify-only firing), `review_run` (a revision after a human comment). Replaced by Runs whose kind comes from the automation's action ([TASK-4]).
  - **[v0.7 choice]** Execution statuses: `idle, scheduled, queued, running, awaiting_input, awaiting_review, failed, completed, cancelled`. Replaced by the Agent Run state machine ([RUN-3]).
  - **[v0.7 choice]** Kind selection on schedule: if the task had notification delivery targets **and** no agent delegate, the firing was a `reminder`; otherwise it was an agent run. Replaced by an explicit `notify` action ([TASK-5]).
  - **[v0.7 choice]** Each occurrence recorded: scheduled-for, started, completed and duration; prompt, result summary, full result and error body; requires-review and review state; executor and requester actors, and token usage; the delivery result (per-channel success or error, the delivered-at time, and success/total counts); and a retry-of link to the previous occurrence. Delivery results become Delivery records ([NOTIF-3]).
  - **[v0.7 choice]** The worker was idempotent: it skipped any occurrence not in `queued`.
  - **[v0.7 choice]** Execution history was cursor-paginated, 20 per page, newest first.
- **How v0.7 did it (non-normative):** an occurrence table with one worker that branched on kind.
- **Known problems in v0.7:**
  - The kind was inferred from the targets and the delegate, which is surprising.
  - The `awaiting_*` statuses were never used.
  - Task-level denormalised "latest" fields drifted from the occurrence rows.
- **Better options today:** every firing is a Run (PRD), with delivery records from the outbox. Make the kind explicit from the automation's action (`notify` vs `run agent`).
- **PRD refs:** [TASK-4] "Every firing is an Occurrence, recorded as a Run", [NOTIF-3], Appendix A.

### Schedules, recurrence UI and time zones
- **User intent:** "remind me tomorrow at 9", "every weekday at 8, summarise my inbox", in plain language or through a picker.
- **Observations:**
  - **[v0.7 choice]** Schedule types: `none`, `one_time` (the rule is an ISO date-time), `recurring` (the rule is a cron expression). Replaced by schedule triggers ([TASK-3]).
  - **[v0.7 choice]** Optional schedule fields: `maxOccurrences`, enforced at tick time (when the count reached the maximum, the schedule was removed); a human-readable `scheduleSummary`, shown in the task sidebar; an IANA `timezone`; the next occurrence time.
  - **[v0.7 choice]** Cron accepted **5 or 6 fields** and was validated on save ("Invalid cron expression for scheduleRule"). A one-time rule had to parse as a date-time ("Invalid ISO datetime for one_time scheduleRule").
  - **[v0.7 choice]** The next fire time was computed in the task's time zone, falling back to the server time zone when it was null (see RULE-UX-8).
  - **[v0.7 choice]** The user's profile time zone was auto-detected from the browser when unset and passed to the agent's system context. The agent was told to "Convert relative times to absolute ISO 8601 using the current date/time and user timezone".
  - **[v0.7 choice]** Pause and resume applied only to recurring tasks ("Only recurring tasks can be paused"). Pause cleared the next occurrence and disabled the schedule. Resume recomputed the next occurrence from now; missed runs were skipped. Replaced by trigger pause (RULE-UX-3) and the catch-up policy ([TASK-3]).
  - **[v0.7 choice]** In practice the **only way to schedule was the agent (chat)**. A recurrence picker was built but **never wired into any screen**, and the web create/edit form had no schedule fields.
- **Capabilities (must be possible):** (v0.7 picker and form: Appendix A.3)
  - Schedule a task to fire once or on a recurring pattern directly in the UI, not only by asking the agent. [TASK-3]
  - Express the common patterns (daily, weekdays, weekly, monthly, every N days, weeks or months) at a chosen time, with an optional end date or maximum count. [TASK-3]
  - See, in plain language, what a schedule means and when it fires next, wherever the task is shown.
  - Optionally fire the first run immediately when saving a schedule.
  - Pause and resume recurring work (RULE-UX-3).
- **How v0.7 did it (non-normative):** cron strings on the task, a DB-backed scheduler keyed per task, and agent tool guidance for reminders.
- **Known problems in v0.7:**
  - The picker parsed cron back into patterns with substring matching (e.g. `"0 9 15 * *"` was not recognised as monthly).
  - "Every N days" was emitted as `*/N` in the day-of-month field, which resets each month.
  - The end date was never enforced server-side (inferred).
  - There was no UI to schedule at all.
- **Better options today:**
  - Use RRULE (RFC 5545) as the canonical form with a time zone; cron stays an advanced option.
  - Idea: natural-language date parsing in the quick-create box, as in Linear, Todoist and Things: "every weekday 9am".
  - Idea: preview the next 3–5 fire times in the user's time zone.
  - Use the Temporal API for zone-correct maths.
  - Catch-up policy per the PRD.
- **PRD refs:** [TASK-3] (cron with TZ, RRULE, one-time; start/end/max; catch-up `skip|run_once|run_all`), [TASK-5], [TASK-6].

### Task list views, filters and sorting
- **User intent:** quickly slice tasks by who, what state and when.
- **Capabilities (must be possible):** (v0.7 specifics: Appendix A.4)
  - Jump to the common slices of tasks: everything, mine, delegated to agents, needing review, recurring, completed. [WEB-9]
  - Filter by status, priority, assignee (people and agents together) and tag, and sort by due date, status, priority or title. [TASK-1a]
  - See the same query in more than one presentation (list, board). [TASK-1a], [WEB-9]
  - Tell at a glance whether a task is recurring, delegated to an agent, a one-time reminder or a plain task.
  - Find any assignee, human or agent, from one search, including assignees who are no longer active.
  - Share or bookmark a filtered view and get back to it with Back. [WEB-3]
- **How v0.7 did it (non-normative):** client-side quick-view presets mapped to query parameters.
- **Known problems in v0.7:**
  - "Assigned to Me" actually meant "manual mode", not "assignee = me".
  - No board view, no sub-tasks and no checklist.
- **Better options today:** Idea: Linear's list/board with group-by (status, assignee, priority, project, due) and instant filter chips. URL-encoded filters.
- **PRD refs:** [TASK-1a], [WEB-9], [WEB-3].

---

## 2. Item metadata and cross-item views

### Pin, flag and tags
- **User intent:** lightweight personal organisation that works on every kind.
- **Observations:** (v0.7 UI specifics: Appendix A.5)
  - **[v0.7 choice]** **Pin:** a boolean on every item.
  - **[v0.7 choice]** **Flag:** one of exactly five colours, `red`, `yellow`, `orange`, `green` or `blue`, or none. The Flagged view could filter by colour.
  - **[v0.7 choice]** **Tags:** names were trimmed, **lowercased** and de-duplicated on write, and empty names were dropped. Tags were unique per user. Replaced by display names matched case-insensitively, per space ([ORG-1]).
  - **[v0.7 choice]** Tag get-or-create was a single atomic upsert (insert, ignore conflicts, then select).
  - **[v0.7 choice]** **Popular tags:** the top N (default 10) by usage count across all kinds, ties broken alphabetically (case-insensitive), offered as quick links into the All view filtered by that tag.
  - **[v0.7 choice]** AI tag generation ran on every new item (including tasks and notes) unless processing was disabled for the item. AI tags gain provenance under [PRIN-5].
- **How v0.7 did it (non-normative):** columns duplicated on every per-kind table, with a tag join table per kind.
- **Known problems in v0.7:**
  - Pin and flag filters ran *in memory after* fetching N items per kind, so paging was wrong and counts were capped.
  - AI-generated tags were indistinguishable from user tags.
  - Lowercasing destroyed display case ("iOS" became "ios").
- **Better options today:**
  - Store the display name and match case-insensitively (PRD ORG-1).
  - Record tag provenance and confidence so AI tags can be accepted or rejected.
  - Tag colour and description; rename and merge.
- **PRD refs:** [PRIN-1], [PRIN-5], [ORG-1], Appendix A (`item_tags(source, confidence)`).

### "Pending" review of new captures
- **User intent:** a quick triage pass over everything captured or auto-imported, keep or discard.
- **Observations:** (v0.7 UI specifics: Appendix A.5)
  - **[v0.7 choice]** Content items (not tasks) had a review status of `pending`, `accepted` or `rejected`. New captures defaulted to `pending`. Replaced by `triage` attention items ([ORG-5]).
  - **[v0.7 choice]** The Pending view listed them, with an Accept action (sets `accepted`) and a Reject action.
  - **[v0.7 choice]** **Reject deleted the item.** Replaced by soft delete to Trash ([HIST-4]).
  - **[v0.7 choice]** The dashboard counted "Pending Review" across bookmarks, documents and photos.
- **How v0.7 did it (non-normative):** a per-item review column, separate from task review.
- **Known problems in v0.7:**
  - The column name meant two different things (capture triage vs task review).
  - Reject was a hard delete with no undo.
  - The Pending stat omitted notes and media.
- **Better options today:** `triage` attention items for new captures. Reject becomes archive or trash with undo, and "accept" can also accept the AI suggestions.
- **PRD refs:** [ORG-5] `triage`, Appendix A (`reviewStatus` → suggestions + attention items), [WEB-6] suggestions.

### Built-in views: All, Pending, Due Now, Pinned, Flagged
- **User intent:** cross-kind smart views reachable from the sidebar.
- **Capabilities (must be possible):** (v0.7 specifics: Appendix A.6)
  - Reach cross-kind views (everything, awaiting triage, due or overdue, pinned, flagged) from the main navigation, each with a live count. [ORG-6], [WEB-2]
  - Filter any of them by kind, tag and flag colour, search within them, and deep-link to a filtered view. [WEB-3]
  - Act on items directly from a view (for example accept or reject a new capture).
  - Understand from an empty view how items get into it.
  - Trust that counts and pages cover the whole result set, and stay current without reloading. [ORG-2]
- **How v0.7 did it (non-normative):** one cross-kind endpoint that fanned out to every kind's query and merged the results in memory.
- **Known problems in v0.7:** the merge-in-memory design gave wrong pagination and totals, the views were not saveable, and "today" used the server time zone.
- **Better options today:** declarative smart collections over one Items query (PRD). Views are saved as data with display preferences; counts come from the index.
- **PRD refs:** [ORG-6] (All, Inbox, Due soon, Overdue, Pinned, Flagged, Recently added…), [ORG-2] smart collections, [WEB-3].

### Dashboard widgets
- **User intent:** an at-a-glance overview of the user's data and the system's health.
- **Capabilities (must be possible):** (v0.7 specifics: Appendix A.7)
  - See at a glance how much of each kind they have, and how much storage it uses. [WEB-15]
  - See what needs attention and what is coming up next, and jump from any figure to the matching view. [WEB-15]
  - See recent activity and activity trends over time.
  - See processing health. [WEB-15]
- **How v0.7 did it (non-normative):** a fixed layout fed by one stats endpoint plus several hooks.
- **Known problems in v0.7:** not configurable, no inbox or agent-activity widget, and an unused due-items widget left in the codebase.
- **Better options today:** Idea: a configurable widget grid driven by view descriptors, with the defaults listed in the PRD.
- **PRD refs:** [WEB-15], [WEB-13] dashboard widgets (P1).

### History and filters by actor type
- **User intent:** "what changed, and who (me, an agent, the system) changed it".
- **Capabilities (must be possible):** (v0.7 specifics: Appendix A.8)
  - See what changed on an item or across the account, and who changed it, telling humans, agents, the system and services apart. [HIST-1]
  - Filter that history by action, kind, actor type and text, over the full history rather than what happens to be loaded.
  - Read each change as a plain sentence.
- **How v0.7 did it (non-normative):** one history table mixing change log, audit and prompt log. Filtering happened client-side over the loaded pages.
- **Known problems in v0.7:** client-side filtering over paged data; the item-type list omitted notes and media; change history and audit mixed together.
- **Better options today:** a per-item change history plus a separate audit log, with server-side filters. Idea: actor chips.
- **PRD refs:** §4.7, Appendix A (history → change log, audit log, threads/runs), [ORG-4].

---

## 3. Assistant UX (web)

### Presentations: side panel, full screen, floating overlay, sidebar AI mode
- **User intent:** the assistant is always one gesture away and never makes the user lose their place.
- **Capabilities (must be possible):** (v0.7 specifics: Appendix A.9)
  - Open the assistant from anywhere without losing your place, and expand it to a focused full view and back. [WEB-4]
  - Resize the assistant alongside the content, with size and open state remembered. [WEB-4], [WEB-3]
  - Start common assistant actions (ask, upload, delegate a task) quickly, by pointer, touch or keyboard alike. [WEB-2], [WEB-11]
  - Hide any always-visible assistant launcher.
  - See which agents and conversations are running, failed or have an unread reply, and jump to them. [RUN-8]
  - Switch agent, start a new conversation, open history and rename the conversation without leaving the assistant. [WEB-4]
  - Use the whole assistant on a phone. [WEB-10], [PWA-1]
  - Approve or deny tool calls in every presentation of the assistant. [APPR-2], [UI-2]
  - Close the assistant and discard context that was pre-attached but not yet used.
- **How v0.7 did it (non-normative):** three render paths over one chat state, plus a separate chat pane on agent pages.
- **Known problems in v0.7:**
  - The overlay opened **on hover only**: touch and keyboard users could not use it.
  - Panel width and open state were not persisted.
  - The mobile nav had drifted from the desktop nav (it was missing Inbox and Media).
  - The full-screen instance did not wire the approval handlers, so the buttons did nothing there.
- **Better options today:**
  - Idea: one assistant component with dock modes (right, bottom, full, pop-out window); size and open state persisted per device and in the URL ([WEB-3]).
  - Idea: on mobile, a full-height sheet.
  - Idea: replace the radial overlay with the ⌘K palette ("Ask the agent…") plus a single launcher button.
- **PRD refs:** [WEB-4], [WEB-10], [WEB-11], [PWA-1].

### "Chat about this" and attaching items
- **User intent:** ask about the thing the user is looking at without copy-pasting it.
- **Capabilities (must be possible):** (v0.7 specifics: Appendix A.10)
  - Start or continue a conversation about any item, of any kind, from wherever it appears, with that item attached as context. [WEB-4]
  - Ask about several selected items at once. [WEB-4], [WEB-5]
  - Attach items from inside the conversation as well.
  - See what is attached, remove it, and rely on it staying attached for the rest of the conversation. [RUN-1]
  - Keep the agent's full tool set when items are attached ([RUN-6]), even for large items.
- **How v0.7 did it (non-normative):** a global browser callback carrying `{type, id, title}`.
- **Known problems in v0.7:**
  - **Attaching an item disabled all agent tools for that turn**: a surprising, silent capability loss.
  - There was no multi-select "ask about these".
  - No attach or drop button in the composer, so the user could not attach from inside the chat.
  - Whole-item inlining blew the context window on large documents (inferred).
- **Better options today:**
  - Context as references: the agent gets item IDs plus retrieval and read tools, not inlined blobs.
  - Idea: an `@`-mention item picker in the composer (as in Cursor, Notion AI and Linear).
  - Idea: drag items or files onto the composer.
  - Multi-select "Ask about these".
  - Idea: show the "context used" chips on the response.
- **PRD refs:** [WEB-4] "Ask about this" on item or multi-selection, [WEB-5], §5.6.

### Content-link previews in responses
- **User intent:** when the agent mentions one of the user's items, the user can click straight into it.
- **Capabilities (must be possible):** (v0.7 specifics: Appendix A.11)
  - Click from an agent reply straight into any of the user's items it mentions or cites. [WEB-4], [MEM-1]
  - Recognise each linked item before clicking: what kind it is, what it is called, and its state where relevant (e.g. a task's status).
  - Get the same previews for every kind and every link form, including when reopening an old conversation. [ORG-3]
- **Known problems in v0.7:**
  - Media links were not recognised.
  - Absolute URLs and `eclaire://` links did not match.
  - Previews were not rendered when reloading history.
  - Detection was a regex over prose rather than structured citations.
- **Better options today:**
  - Structured citations in the agent stream (AG-UI custom events or tool-result references). Idea: render them as inline chips with hover previews.
  - `eclaire://item/<id>` as the canonical link form.
- **PRD refs:** [WEB-4] citations and item links as rich previews, [ORG-3].

### Activity / step view, thinking and approvals
- **User intent:** trust through transparency: see what the agent did, without noise.
- **Capabilities (must be possible):** (v0.7 specifics: Appendix A.12)
  - See what the agent did with progressive disclosure: a short summary by default, the step timeline on demand, and full tool inputs and outputs on demand. [RUN-7], [WEB-4]
  - Watch tool calls progress live, and see at once which failed and which are waiting for approval.
  - Approve or deny a pending tool call where it appears; a pending approval is never collapsed out of sight. [APPR-2]
  - Show or hide the model's reasoning, and know when the current model cannot provide it.
  - Stop a response at any time. [RUN-4]
  - Hear a reply read aloud, automatically or on demand. [VOICE-4]
  - Reload, or switch device, without losing pending approvals or a run in progress. [APPR-3], [RUN-5]
- **How v0.7 did it (non-normative):** a bespoke stream protocol with event types `thought, tool-call, approval-required, approval-resolved, text-chunk, error, done`. Approvals were held in server memory.
- **Known problems in v0.7:**
  - **No Stop button.** Abort happened only implicitly (new conversation or agent switch; Ctrl+C in the CLI). The composer was disabled while streaming.
  - One preference controlled both *showing* thinking and *requesting* it from the model.
  - Approvals were lost on reload or restart, had no timeout UI, no "always allow", and were not visible in history or in channels.
- **Better options today:**
  - AG-UI event stream and reducer, with golden vectors.
  - Idea: a Stop button, plus queue-or-interrupt for messages typed while streaming (as in ChatGPT and Claude).
  - Separate "reasoning effort" (request) from "show reasoning" (display).
  - Persisted approvals with "allow once / always for this tool / deny + reason", resolvable from the Inbox, notifications and channels.
- **PRD refs:** [WEB-4], [PRIN-4], §5.5 approvals, §5.10 streaming, [CLIENT-2] golden vectors, [CHAN-5].

### Conversation history operations
- **User intent:** find, continue, tidy and remove past conversations.
- **Capabilities (must be possible):** (v0.7 specifics: Appendix A.13)
  - Browse past conversations with their title, size and recency, and continue any of them. [WEB-4], [RUN-1]
  - See which conversations have a reply not yet read. [RUN-8]
  - Rename a conversation, delete one, or delete all of them after confirming.
  - Get a sensible title automatically, without typing one. [RUN-1]
  - Search and archive conversations. [RUN-1]
  - See conversations from every surface, including chat channels, in one history. [CHAN-3]
- **Known problems in v0.7:**
  - No search, pin, export or archive.
  - The dialog always listed the *default* agent's conversations, while Delete All acted on the current one.
  - Delete All was a client-side loop over up to 1,000 conversations.
  - Channel conversations did not appear on the web.
- **Better options today:**
  - Idea: a thread list with search, pin, archive and export (markdown/JSON), filterable by agent and surface.
  - An optional LLM title with the heuristic as fallback.
  - Server-side bulk delete.
- **PRD refs:** [WEB-4] thread history, §5.3, [CHAN-3].

### Slash commands
- **User intent:** fast, keyboard-only control of the conversation, the same in web, CLI and chat apps.
- **Capabilities (must be possible):** (v0.7 command list and palette: Appendix A.14)
  - Control the conversation by typed command on every surface: start a new conversation, clear, list history, switch agent, show the model, toggle thinking, use a skill, get help. [CLI-5]
  - Discover commands, agents and skills by typing a prefix, and pick from suggestions by keyboard.
  - Use one of the active agent's skills, with or without a task.
  - See a clear error, with usage, for an unknown command or a bad argument; typed input is never silently thrown away.
- **Known problems in v0.7:**
  - On the web, `/thinking`, `/model` and `/help` did nothing, and `/clear` behaved exactly like `/new`.
  - **Enter submitted the typed prefix instead of the highlighted item.** `/ne` + Enter gave "Unknown command"; the error was only logged and the input silently cleared.
  - Channels did not support `/agent` or skills.
- **Better options today:**
  - Define commands once in the shared SDK, with per-surface capability flags.
  - Idea: Enter selects the highlighted item (standard combobox behaviour, e.g. cmdk).
  - Idea: show argument hints inline.
  - Map commands to native slash commands where the platform has them (Slack, Discord, the Telegram command menu).
- **PRD refs:** [CLI-5] (`/new, /clear, /history, /agent, /model, /thinking, /skills, /help` plus extension commands), [CHAN-3] state per mapping.

---

## 4. Keyboard shortcuts and upload behaviour

### Keyboard shortcuts (complete v0.7 list)
- **User intent:** a keyboard-operable app for power users.
- **Capabilities (must be possible):** (v0.7 shortcut table: Appendix A.15)
  - Do everything from the keyboard: move through lists and grids, open, edit and delete items, page through photos, confirm or cancel inline edits, and send a message or add a new line. [WEB-11]
  - Show or hide navigation, and switch between content and assistant navigation, from the keyboard.
  - Discover the available shortcuts in the app. [WEB-11]
  - Bring the app forward from anywhere with a global shortcut that does not clash with in-app ones. [APPLE-2]
  - Abort a terminal chat run from the keyboard, stopping it on the server too. [RUN-4]
  - **[Rule RULE-UX-10]** Single-key shortcuts MUST NOT fire while focus is in a text input. v0.7 suppressed its list shortcuts there.
- **Known problems in v0.7:**
  - No ⌘K command palette.
  - No shortcut help (`?`).
  - No shortcuts for task status, priority or assignee.
  - The tile-view row jump assumed 3 columns.
  - Two competing ⌘B handlers.
  - The desktop app's global chord collided with an in-app one.
- **Better options today:**
  - Idea: a Linear-grade keymap:
    - `c` to create.
    - `s`, `p` and `a` to set status, priority and assignee.
    - `j` / `k` to move.
    - `x` to select.
    - `/` to search.
    - `g` then a letter to navigate (e.g. `g i` for Inbox).
    - `?` for the shortcut sheet.
    - ⌘K for the palette (cmdk).
  - Use a hotkey library with scopes (react-hotkeys-hook or similar).
  - The grid row jump should be computed from the actual layout.
- **PRD refs:** [WEB-2] ⌘K, [WEB-11] complete keyboard operability, [TASK-1a] keyboard-first.

### Uploads: drag-drop, paste, folders and limits
- **User intent:** throw anything at Eclaire and it lands in the right place.
- **Capabilities (must be possible):** (v0.7 upload page and limits table: Appendix A.16)
  - Drop, browse for or paste files, many at once and whole folders (keeping their structure), and have each land as the right kind without choosing. §4.2
  - Drop files straight onto the view for a kind.
  - Follow progress, and see at the end exactly which files succeeded and which failed.
  - Know the size and type limits before uploading.
  - Import bookmarks from a browser export. §4.9
  - **[Rule RULE-UX-11]** Upload limits MUST be declared once by the server, per kind, and the client MUST apply the same limits, so a file the UI accepts is never rejected by a hidden or lower limit.
- **Known problems in v0.7:**
  - A **global 50 MB request-body limit** silently overrode the 100 MB photo and 500 MB media limits. The UI accepted files the server then rejected.
  - Limits were inconsistent between client and server.
  - The "Upload Complete: Successfully uploaded N files" toast appeared even when some files failed.
  - Pasting text or a URL did not create a note or bookmark.
  - No global drop target.
  - Bookmarks import accepted only Chrome JSON, not the standard Netscape HTML format.
  - Uploads were not resumable.
- **Better options today:**
  - One server-declared limit per kind, published in the capabilities API so the UI and server agree.
  - Resumable uploads (tus, e.g. with Uppy) for large media.
  - Idea: a global drop zone and global paste: a URL becomes a bookmark, text becomes a note, files become captures.
  - An offline capture queue.
  - Netscape bookmark HTML import.
  - Web Share Target on mobile.
- **PRD refs:** §4.2 capture, [PWA-1] share target and offline queue, [WEB-8] paste/drop in notes, [DEP-5] per-route size limits, §4.9 imports.

---

## 5. Chat channels (Telegram, Slack, Discord; non-voice)

### Platform configuration and capabilities
- **User intent:** talk to an agent, and receive reminders, in the chat apps the user already uses.
- **Observations:**
  - **[v0.7 choice]** **Channel capability**, one of three: `notification` ("System can push information to this channel"), `chat` ("Users can chat with the assigned agent on this channel") or `bidirectional` (both). Replaced by adapter capabilities ([CHAN-1]) and notification routing ([NOTIF-2]).
  - **[v0.7 choice]** Chat-capable channels needed an agent (default `eclaire`): "Chat-capable channels will route conversations through this agent". Kept as the connection's default agent ([CHAN-7]).
  - **[v0.7 choice]** Channel names were limited to 255 characters. Bot tokens were stored encrypted.
  - **[Fact]** Telegram needs a bot token (from @BotFather `/newbot`) and a chat identifier: a numeric ID (groups start with `-100`) or `@channel`. The chat ID can be found with @userinfobot or `getUpdates`.
  - **[v0.7 choice]** Telegram: at start the token was validated (`getMe`) and the command menu registered, non-fatally. It used long-polling, and a 409 polling conflict was retried once after 2 s.
  - **[Fact]** Slack needs a bot token (`xoxb-`), an app-level token (`xapp-`) and a channel ID (`C…`). The bot must be invited with `/invite @bot`.
  - **[v0.7 choice]** Slack: Socket Mode only, plus a mention mode. Documented scopes: chat:write, channels:history, channels:read, app_mentions:read.
  - **[Fact]** Discord needs a bot token and a channel ID (a snowflake, copied via Developer Mode). MessageContent is a privileged intent. Bots are invited via the OAuth2 URL generator.
  - **[v0.7 choice]** Discord: requested intents Guilds, GuildMessages, MessageContent and GuildVoiceStates, plus a mention mode. At start it checked the View Channel, Send Messages and Read Message History permissions and warned if any was missing.
  - **[v0.7 choice]** The CLI's `channel add` printed these setup guides inline. This was valued: users rarely know where tokens and IDs come from.
  - **[v0.7 choice]** CLI `channel test` sent "Test message from Eclaire CLI (<time>)". It refused disabled channels and checked that the config could be decrypted.
- **How v0.7 did it (non-normative):** a channel row per platform connection; an adapter per platform with one bot process each.
- **Known problems in v0.7:**
  - **No sender identity check.** Anyone who could message the bot acted as the owner. On Telegram the configured chat ID was used only for outbound messages.
  - Discord could be added only through the CLI or API (the web form said "coming soon").
  - Editing a channel without re-entering its secrets likely failed validation (inferred).
  - The Slack scope list was incomplete: reactions:write, commands, files:read, groups:history and the message events were missing (inferred).
  - Bots ran only in the API process, so sends from workers or the CLI likely failed (inferred).
- **Better options today:**
  - Identity linking through a pairing code or deep link (Telegram `t.me/<bot>?start=<code>`; Slack and Discord OAuth install).
  - Slack app manifests, so scopes and events are installed in one click.
  - Discord application install links.
  - A lease-owned connection process plus an outbox.
- **PRD refs:** [CHAN-1], [CHAN-2], [CHAN-8], [CHAN-9], Appendix B.4.

### Commands per platform
- **Observations:**
  - **[v0.7 choice]** Telegram: `/start` replied "Hello! I'm your Eclaire assistant. How can I help you today?". Also `/help`, `/new`, `/model`, `/history`, `/settings` (toggles thinking) and `/clear`.
  - **[v0.7 choice]** Slack and Discord: the same commands with an `eclaire-` prefix (`/eclaire-new` and so on) to avoid collisions with other apps. Replies were **ephemeral**. Discord registered them as global commands.
  - **[v0.7 choice]** Replies: "New conversation started.", "Conversation cleared.", "Thinking mode: ON|OFF".
  - **[v0.7 choice]** History listed the last 10 conversations of the channel's agent, with no way to resume one.
- **Known problems in v0.7:**
  - Help advertised `/thinking`, but the registered command was `/settings`.
  - `/start` was missing from help.
  - Thinking defaulted to on, but thinking events were dropped anyway.
  - Slack commands also required manual manifest configuration.
- **Better options today:**
  - Generate per-platform command registration from the shared slash registry ([CLI-5]).
  - Use Telegram `setMyCommands` with scopes, and Discord application commands with autocomplete for agent names.
- **PRD refs:** [CLI-5], [CHAN-3].

### Mention modes, `@agent` routing and Slack threads
- **User intent:** in shared spaces, the bot speaks only when addressed. Users can pick a specialist agent by handle.
- **Observations:**
  - **[v0.7 choice]** Mention modes (Slack and Discord): `all` (process every message; the default), `mention_only`, and `mention_or_reply` (on Slack any thread reply counted; on Discord a reply to one of the bot's messages counted).
  - **[v0.7 choice]** Slack: threads the bot took part in continued without a mention for **24 h** (a cache of 5,000 threads) (starting point; tune).
  - **[v0.7 choice]** Slack: inbound dedup by message timestamp for 60 s.
  - **[v0.7 choice]** Slack **debounce:** rapid messages from the same user in the same thread were joined and sent once, after **1,500 ms** of quiet (starting point; tune).
  - **[v0.7 choice]** Slack: messages with a subtype (edits, joins) were ignored, except audio file shares.
  - **[v0.7 choice]** Discord: other bots were ignored.
  - **[v0.7 choice]** **`@handle` routing:** pattern `^\s*@([a-z0-9_-]+)\s*[:,-]?\s*(.*)$`, case-insensitive, lowercased. The bot's own mention was stripped first (Slack and Discord). Replaced by connection routing with `@handle` addressing ([CHAN-7]).
  - **[v0.7 choice]** **Handle slug of an agent name:**
    1. Unicode NFKD, lowercase (accents drop out).
    2. Drop anything outside letters, digits, `_`, space and `-`.
    3. Spaces and underscores become `-`; repeated dashes collapse; edge dashes are trimmed.
    4. The kebab, snake and squashed forms all match.
  - **[v0.7 choice]** Unknown handle: "I couldn't find agent @x. Try one of: …" (up to 6 suggestions). A handle with no text: "Tell me what you want <Name> to do after @handle."
  - **[v0.7 choice]** Routing to a different agent reset the session.
  - **[Rule RULE-UX-12]** On platforms with threads, the reply to a message in a thread MUST be posted in that thread, and each thread MUST map to its own conversation ([CHAN-3]).
- **Known problems in v0.7:**
  - Slack replies mostly went top-level. Only errors, rate-limit notices and audio replies were threaded, and participation was recorded even when the bot had not replied in the thread.
  - Slack and Discord shared **one conversation per platform channel across all users and threads**.
  - Sessions were in memory and lost on restart.
  - In Telegram groups, "@BotUsername hello" was parsed as an agent handle and errored.
  - Discord threads were ignored (inferred).
- **Better options today:**
  - Persisted (connection, chat, thread, user) → thread mapping.
  - Always reply in the thread on Slack (Slack's AI-app "assistant threads" with suggested prompts and a status line).
  - Discord threads per conversation.
  - Telegram forum topics or reply chains.
  - Strip the bot's own @username on Telegram.
- **PRD refs:** [CHAN-3], [CHAN-7], [CHAN-2] per-sender checks in groups.

### Streaming by message edit, limits and markup
- **User intent:** replies feel live in chat apps, and long answers are never truncated.
- **Observations:**
  - **[v0.7 choice]** **Edit-streaming loop** (starting point; tune):
    1. Send a placeholder message containing only the cursor glyph.
    2. Start editing once at least **30 characters** have arrived.
    3. Throttle edits to **one per 1,000 ms**, with a trailing edit; skip identical text.
    4. The final edit removes the cursor.
  - **[v0.7 choice]** Cursor glyphs: `▍` on Telegram, `◍` by default.
  - **[v0.7 choice]** **Rollover:** when the text exceeded (limit − cursor − 100), that message was finalised and the reply continued in a new one.
  - **[Fact]** Platform message limits: Telegram 4,096 characters, Discord 2,000.
  - **[v0.7 choice]** Working limits per platform:

    | Platform | Streaming limit | Split limit (non-streaming) |
    |---|---|---|
    | Telegram | 4,096 | 4,000 |
    | Slack | 3,900 | 3,900 |
    | Discord | 2,000 | 1,900 |

  - **[v0.7 choice]** **Split order** for non-streamed text: paragraph, then line, then sentence, then space, then a hard cut. A break counted only if it fell past 30% of the limit. Chunks were sent 100 ms apart.
  - **[v0.7 choice]** Fallback texts: "No response was generated." for an empty reply; "An error occurred while generating the response." (or the partial text) on error.
  - **[Fact]** Telegram's "message is not modified" edit error is benign and can be ignored.
  - **[Fact]** Slack mrkdwn requires `& < >` to be escaped first; Discord renders markdown natively.
  - **[v0.7 choice]** Slack: after escaping, links, bold and strikethrough were converted to mrkdwn. Telegram: v0.7 sent plain text, so raw `**` showed, including in the reminder template.
- **Known problems in v0.7:**
  - Thinking, tool and approval events were dropped, so a pending approval looked like a frozen cursor until its 300 s timeout.
  - Splitting was not aware of code fences (inferred).
  - Slack streamed replies skipped mrkdwn conversion.
  - Telegram had no parse mode.
- **Better options today:**
  - **Telegram:** `sendMessageDraft` streams a native, animated draft in private chats (Bot API 9.x). A final `sendMessage` persists it. Use HTML parse mode or entities rather than MarkdownV2 escaping.
  - **Slack:** `chat.startStream` / `appendStream` / `stopStream` (Oct 2025) send increments instead of full-text `chat.update`, at a gentler rate tier. Use Block Kit for approvals.
  - **Discord:** Components V2 and buttons for approvals. Edit-streaming is still the norm there.
  - A per-surface renderer from one markdown AST (e.g. remark/mdast) to each dialect, with fence-aware splitting.
- **PRD refs:** [CHAN-1] capabilities (edit streaming, limit, markup dialect), [CHAN-5], [CHAN-6], [CHAN-10].

### Rate limiting, retries, circuit breaker and typing indicators
- **Observations:**
  - **[v0.7 choice]** **Inbound rate limit:** 20 messages per 60 s per channel (starting point; tune). Reply: "You're sending messages too quickly. Please wait a moment before trying again."
  - **[v0.7 choice]** **Outbound retry:** 3 attempts, with a 1 s base delay doubling up to a 30 s cap, plus 0–10% jitter (starting point; tune). A server-provided `retry_after` was honoured exactly; Slack and Discord fell back to 5 s. Network errors were retried. Auth errors (`invalid_auth`, `token_revoked`, `missing_scope`) were never retried. Replaced by outbox retries ([CHAN-8]).
  - **[v0.7 choice]** **Circuit breaker:** suspend after 10 consecutive failures. On Telegram, only 401s counted, keyed per bot token.
  - **[Fact]** Hammering Telegram with a bad token risks Telegram revoking it.
  - **[v0.7 choice]** Discord gateway reconnect: 5 s doubling to 30 s, at most 3 attempts.
  - **[Fact]** Typing signals expire: a Telegram "typing" action lasts about 5 s, a Discord typing trigger about 10 s. Slack has no bot typing indicator.
  - **[v0.7 choice]** v0.7 sent one typing signal per reply. On Slack it added a `:thinking_face:` reaction to the user's message and removed it when the reply finished or failed.
- **Known problems in v0.7:**
  - Typing was never refreshed during long runs.
  - The rate limit was per channel, not per sender.
  - The circuit breaker swallowed errors silently.
- **Better options today:**
  - Refresh typing every ~4 s (Telegram) and ~8 s (Discord) while a run is active.
  - Slack `assistant.threads.setStatus` ("is thinking…").
  - Per-sender limits after identity linking.
  - Surface breaker state in connection health.
- **PRD refs:** [CHAN-1] typing indicator, [CHAN-8] retries with backoff, [CHAN-9], §7.8.

### Inbound media
- **Observations:**
  - **[v0.7 choice]** Telegram handled text and voice only. Slack handled text and audio files.
  - **[v0.7 choice]** Discord appended attachment links to the prompt as `[Attachments: name (type): url]`, accepting only Discord CDN hosts.
  - **[v0.7 choice]** Nothing became an item. Replaced by inbound media as capture ([CHAN-4]).
- **PRD refs:** [CHAN-4] replaces this: inbound media is capture.


---

## 6. Notifications

### Severity, targets and delivery
- **User intent:** reminders and agent messages reach the user wherever they are (in v0.7 that meant chat apps).
- **Observations:**
  - **[v0.7 choice]** Severity had four values: `info` (default), `warning`, `error`, `critical`. It was only logged and recorded in history; it never changed routing or formatting. The values are kept by [NOTIF-1] and drive routing under [NOTIF-2].
  - **[v0.7 choice]** Targets were the user's own *active* chat channels, each with a capability (`notification`, `chat` or `bidirectional`). If explicit channel IDs were given, exactly those channels were used, whatever their capability; if none were given, every channel with the `notification` or `bidirectional` capability was used. Replaced by per-user routing policy ([NOTIF-2]).
  - **[v0.7 choice]** A task's delivery targets were a list of `{type: "notification_channels", ref?: channelId}`. With no `ref`, delivery went to all notification-capable channels; with refs, to those channels only.
  - **[v0.7 choice]** The send result was reported per channel (channel id, channel name, platform, success and error), with totals `totalChannels`, `successfulChannels` and `failedChannels`. Replaced by Delivery records ([NOTIF-3]).
  - **[v0.7 choice]** Delivery failure did **not** fail the reminder occurrence ("completing occurrence anyway").
  - **[Rule RULE-UX-13]** A notification or reminder that has no deliverable target MUST be surfaced to the user (for example as a `failure` attention item), never dropped silently. v0.7 did this with an Inbox item for reminders and with tool text for agents.
  - **[v0.7 choice]** The agent notification tool required approval ("Always confirm with the user before sending notifications", "Describe which channels will receive the message"). With no channels it replied: "No active notification channels found. The user needs to configure channels first." Replaced by the [NOTIF-4] policy defaults.
  - **[Fact]** Telegram offers parse modes `HTML`, `Markdown` and `MarkdownV2`, and an option to disable web previews.
  - **[v0.7 choice]** The generic notification API accepted those Telegram-specific options.
  - **[v0.7 choice]** **Reminder message format** (exact):

    ```
    🔔 **Reminder**: <task title>
    <task instructions, or the title if none>
    ```

    Occurrence summaries read: "Reminder delivered to X/Y channels" or "Reminder completed (no channels configured)".
- **How v0.7 did it (non-normative):** an endpoint fanned out directly to channel adapters with settle-all, and wrote one history row (`send_notification`).
- **Known problems in v0.7:**
  - No in-app notification centre, no web push and no email.
  - No outbox, retry, quiet hours or dedup.
  - Platform-specific options leaked into the generic API.
  - Agents needed approval even to notify the user themself.
- **Better options today:**
  - Self-hosted Web Push with VAPID; it works for iOS home-screen PWAs since iOS 16.4.
  - ntfy or Gotify for push.
  - A routing policy per category and severity, with quiet hours and a critical bypass.
  - A notification centre separate from the Inbox.
  - An outbox with delivery records.
- **PRD refs:** [NOTIF-1]–[NOTIF-5], [CHAN-8], [APPLE-6], [TASK-5].

---

## 7. Onboarding

### First-run wizard
- **User intent:** go from an empty instance to a working assistant in minutes, the same way on the web and in the CLI.
- **Capabilities (must be possible):** (v0.7 steps, presets, copy and routing: Appendix A.17)
  - Claim a fresh instance and create the admin account. [WEB-14]
  - Pick a starting preset (fully local, cloud with a key, or custom) and adjust its defaults, such as base URLs. [WEB-14]
  - Choose models for each role, with a warning when the chosen model cannot process documents and a way to pick a second model for that. §5.1
  - Verify the setup with a health check that says what is broken, what is only optional, and how to fix it, and decide whether to continue. [CLI-3] `doctor`
  - Decide who may create accounts. [WEB-14]
  - Leave and resume setup at any point, in the web app or the CLI, with the same state. [WEB-14], [CLI-3]
  - Change preset or reset setup progress without losing providers and models already configured, and be told so.
  - Retry a failed preset without leftovers from the failed attempt.
  - Get a specific, actionable reason whenever something blocks finishing.
  - Finish with suggested first actions.
  - **[Rule RULE-UX-14]** Setup MUST derive each step's completion from real system state, not from recorded clicks, so it is resumable, idempotent and tolerant of changes made outside setup; an instance that is already configured MUST never be sent through first-run setup again, including after an upgrade.
- **How v0.7 did it (non-normative):** a server-side state machine with step checks over instance settings. Web and CLI were both clients of it.
- **Known problems in v0.7:**
  - **First registrant became admin.** Onboarding endpoints were public while there were zero users, so claiming a freshly exposed instance was a race.
  - Registration defaulted to open.
  - Preset URLs were hard-coded to `127.0.0.1`, which is wrong inside containers (inferred).
  - The MLX preset port (11434) disagreed with the env default (8080).
  - No onboarding tests.
- **Better options today:**
  - A setup token printed in the logs or CLI, as Grafana, Jenkins and Home Assistant do.
  - Invite-only by default.
  - Auto-detect local inference servers (Ollama, LM Studio, llama.cpp and MLX all expose model-list endpoints) and pre-fill a "fully local" preset.
  - An optional import step.
- **PRD refs:** [WEB-14], [CLI-2], [CLI-3] `setup`/`doctor`, [DEP-7] detection, §7.1; Appendix A ("First registrant = admin" → setup token + invite-only).

---

## 8. Settings

### Settings sections and options
- **User intent:** one place for personal preferences, and admin control of the instance.
- **Capabilities (must be possible):** (v0.7 sections, fields and limits: Appendix A.18)
  - Edit their profile, including a time zone that is detected automatically when unset. [MEM-3]
  - Change password, manage connected accounts, and delete all their data or the whole account after re-entering the password. [HIST-4]
  - Control appearance and how the assistant displays (reasoning, launcher). [WEB-12]
  - Configure voice input and output. [VOICE-4]
  - Browse the tools and skills available to agents, with their status, access level and parameters, and learn how to add custom skills. [SKILL-2]
  - Manage chat channels.
  - Choose how and where notifications reach them, with the trade-offs explained. [NOTIF-2], [APPLE-6]
  - Issue scoped API keys for themselves, for each of their agents and for external systems; see each secret once; see when a key was created and last used.
  - As an admin: manage MCP servers, browser control, models (including default model roles), providers, users and the registration policy. §5.1, §7.7
  - See the version and build of the instance.
  - Have their preferences follow them across devices. [WEB-3]
- **Known problems in v0.7:**
  - Some preferences were per device, others per account, which is surprising across devices.
  - The settings UIs were hand-built per section.
  - There was no notifications section, because no routing existed.
  - The model role names (backend/workers) were jargon.
- **Better options today:**
  - Generate settings from config schemas (JSON Schema forms).
  - Put all user preferences on the server, with device-local overrides only where that makes sense, such as panel width.
  - Add a Notifications section that explains the push trade-offs.
  - Idea: searchable settings, so ⌘K can jump straight to a setting.
- **PRD refs:** [WEB-13] settings panels from schemas, [WEB-3] server-side display preferences, [APPLE-6] notifications screen, §5.1 model roles, §7.7.


---

## 9. Admin and ops

### Backup and restore
- **User intent:** one command to get a restorable copy of everything, and a safe, explicit restore.
- **Observations:**
  - **[v0.7 choice]** What was backed up: (1) a logical DB dump (plain SQL); (2) blob storage (user files); (3) deployment config (compose file and AI config directory); (4) the env file with secrets (encryption key, auth secret, API-key HMAC key). Replaced by built-in instance backup ([PORT-2]).
  - **[v0.7 choice]** Backups went to a timestamped directory with mode 0700.
  - **[v0.7 choice]** **Validation mode** restored the dump into a temporary DB and compared table counts, row activity, checksums and directory stats.
  - **[Rule RULE-UX-15]** An instance backup MUST be self-sufficient and verifiable: it includes the keys needed to decrypt stored secrets (encrypted, never in plaintext), carries an app-version stamp that restore checks, and can be validated by a test restore. The encryption key decrypts provider keys and channel tokens, so without it the data is unreadable; a validated backup is the only backup worth having.
  - **[v0.7 choice]** Restore UX: `--latest`, `--backup <path>` and `--dry-run`; a preview of what would change, then a first confirmation, then the user typed **"I AGREE"**.
  - **[v0.7 choice]** Before overwriting the DB, restore terminated other DB connections, then dropped and recreated the database.
  - **[v0.7 choice]** Config files were restored one at a time, each with a diff summary ("Current: 3KB (date) → Backup: 2KB (date)", "New file", "No changes").
- **How v0.7 did it (non-normative):** host-side Node scripts, outside the CLI and the image, for Postgres only.
- **Known problems in v0.7:**
  - Live DB data directories were copied raw while running, alongside the dump. The copy is inconsistent and wastes space.
  - Secrets were stored in plaintext in the backup.
  - No version stamp, so a backup could be restored into the wrong app version.
  - SQLite and PGlite had no logical backup.
  - No automatic backup before a migration.
  - No CLI command.
- **Better options today:**
  - `eclaire backup` / `restore` over the API or admin socket.
  - An encrypted archive (age) with a manifest and version stamp.
  - SQLite `VACUUM INTO` or the Litestream approach; `pg_dump -Fc` for Postgres.
  - Scheduled backups with retention.
  - A restore drill in CI.
- **PRD refs:** §4.10, [DEP-6] pre-migration backup, [DEP-7] Time Machine-safe snapshots, [CLI-3] `backup`/`restore`.

### Upgrade gate and restart-loop avoidance
- **User intent:** upgrading by pulling a new image either just works, or stops with a clear, visible message. It never corrupts data and never crash-loops.
- **Observations:**
  - **[v0.7 choice]** Startup classified the instance into one of six states. Kept in spirit by the startup version gate ([DEP-6]):

    | State | Meaning | Action |
    |---|---|---|
    | `up-to-date` | | start |
    | `fresh-install` | no migration table | auto-init, then print "run onboard or open http://localhost:3000" |
    | `safe-upgrade` | pending migrations, no manual steps | auto-apply |
    | `needs-upgrade` | a manual step is required | print the exact command to run |
    | `downgrade` | DB version is newer than the app | FATAL banner |
    | `blocked-upgrade` | no supported path from this version | message pointing to the changelog |

  - **[v0.7 choice]** The classification compared the recorded installed version with the app version (semver), and journal migrations with applied ones.
  - **[v0.7 choice]** Exit codes of the check: 0 up-to-date, 1 manual, 2 downgrade, 3 fresh, 4 safe, 5 blocked.
  - **[Fact]** With a restart policy such as `restart: unless-stopped`, a container that exits on a refused start crash-loops and buries the explanation.
  - **[v0.7 choice]** **Restart-loop trick:** when the gate refused to start, or init or upgrade failed, the entrypoint did **not exit**; it slept forever (`exec sleep infinity`). The container stayed "running but unhealthy": the `/health` check failed, and `docker logs` still showed the banner with the fix command.
  - **[Rule RULE-UX-16]** The startup gate MUST distinguish "database unreachable" from "database empty", and MUST never initialise on an unreachable database. When it refuses to start, the service MUST stay up in a degraded state that shows the reason and the fix, instead of exiting into a restart loop.
  - **[v0.7 choice]** In dev mode the same check ran in-process. A fresh DB printed "DATABASE NOT INITIALIZED … run pnpm setup:dev" and exited.
  - **[v0.7 choice]** `upgrade` and `upgrade-check` were exposed as container subcommands: `docker compose run --rm eclaire upgrade`.
- **Known problems in v0.7:**
  - **An unreachable DB was classified as `fresh-install`**, so a DB outage could trigger initialization. A rebuild must distinguish "cannot connect" from "empty".
  - No pre-migration backup.
  - Upgrade steps were registered as code with "blocks upgrade path" flags; both 0.6 and 0.7 were blocking.
- **Better options today:**
  - Keep the sleep-not-exit trick, or an equivalent "degraded mode" that serves a status page on the app port explaining the block. Such a page is friendlier than logs.
  - `eclaire upgrade --check`.
  - Forward-only migrations with automatic backup.
  - Expand/contract for scale-out.
- **PRD refs:** [DEP-6], [PRIN-7].

### Config variables users actually needed
- **User intent:** a minimal `.env` for a working deployment.
- **Observations:**
  - **[v0.7 choice]** **Three required secrets**, generated by setup or with `openssl rand -hex 32`: the auth/session secret, the master encryption key, and the API-key HMAC key (versioned, `_V1`).
  - **[v0.7 choice]** **Database:** type, plus either URL or host/port/user/password/name.
  - **[Fact]** Users need a **public URL** setting for reverse proxies, LAN hostnames (e.g. `http://nas.local:3000`) and OAuth callbacks. In v0.7 (`FRONTEND_URL`) it was the most common support issue.
  - **[v0.7 choice]** **Ports:** host port (default 3000) and internal port.
  - **[v0.7 choice]** **Service role:** `all`, `api` or `worker`.
  - **[v0.7 choice]** **Inference server base URL overrides:** llama.cpp (×2), Ollama, LM Studio, MLX LM and MLX VLM.
  - **[v0.7 choice]** **Cloud keys:** OpenAI, Anthropic, OpenRouter.
  - **[v0.7 choice]** **Document converter URL.**
  - **[v0.7 choice]** **Optional integration tokens:** a GitHub token (API rate limits), a Reddit client id/secret, and an X bearer token and OAuth client (bookmark sync).
  - **[Fact]** The paid X API tier needed for bookmark sync costs about $200/month, which users should know up front.
  - **[v0.7 choice]** **Tuning:** log level, worker concurrency (default 5), AI timeout (default 180 s) (starting point; tune).
  - **[v0.7 choice]** A runtime switch (`container` vs `local`) changed every default host, e.g. `host.docker.internal` vs `127.0.0.1`. This was convenient but magical.
- **Known problems in v0.7:**
  - Secrets lived in `.env` with no rotation.
  - Many settings existed both as env vars and as DB settings, so precedence was unclear.
  - The CLI needed the master key in its own env, because it wrote to the DB directly.
- **Better options today:**
  - A typed config schema with `eclaire config doctor`.
  - Secrets in a secret store or keychain.
  - Settings that are not bootstrap settings belong in the DB with an admin UI.
  - Document precedence.
- **PRD refs:** §7.7, [DEP-5] trusted proxy, [DEP-7].

### Port conventions
- **Observations:**
  - **[Fact]** Upstream default ports:

    | Service | Port |
    |---|---|
    | Postgres | 5432 |
    | Document converter (Docling) | 5001 |
    | Ollama | 11434 |
    | LM Studio | 1234 |
    | MLX servers | 8080 |
    | whisper.cpp | 8080 (collides with MLX) |

  - **[v0.7 choice]** Eclaire's own ports:

    | Service | Port |
    |---|---|
    | Production container (web and API on the same origin) | 3000 |
    | Dev web | 3000 |
    | Dev API | 3001 |
    | Postgres | exposed only in the dev overlay |
    | llama.cpp chat / processing | 11500 / 11501 |
    | Audio servers (examples) | 8000 |

  - **[Fact]** Containers reach host services through `host.docker.internal`; mapping it with `extra_hosts: host-gateway` makes it work on Linux too.
  - **[v0.7 choice]** Container healthcheck: `/health` every 30 s with a 45 s start period. Logs rotated at 10 MB × 3.
- **Known problems in v0.7:** the dev and production API ports differed, which confused the desktop app; whisper.cpp and MLX collided on 8080.
- **Better options today:** one port in every topology, with the API under `/api` on the same origin; a published port registry for the optional local servers.
- **PRD refs:** [DEP-1], [DEP-4], [DEP-7] (bind `127.0.0.1` by default).

---

## 10. Desktop app and CLI

### Desktop shell (Electron in v0.7)
- **User intent:** Eclaire as a "real app": dock or tray presence, a hotkey, deep links, auto-update.
- **Capabilities (must be possible):** (v0.7 specifics: Appendix A.19)
  - Open a link to any item and land on that item in the app. [ORG-3], [APPLE-3]
  - Launch the app a second time and get the existing window, not a second instance.
  - Reach the app, and see which server it uses, from the menu bar or tray, and quit it for real.
  - Bring the app forward with a global hotkey of their choosing. [APPLE-2]
  - Receive updates automatically and be told when one is ready. [APPLE-8]
  - Get the window back where they left it; external links open in the system browser.
  - Connect to a server, and be asked for another address when the current one is unreachable.
  - Capture from the desktop (share, quick capture, drag to the app). [APPLE-2]
- **How v0.7 did it (non-normative):** a thin Electron wrapper around the web app, with an isolated, persisted session.
- **Known problems in v0.7:**
  - Nothing in the product ever emitted `eclaire://` links.
  - The "update downloaded" event reached no UI, so users were never told.
  - The default server URL (3001) was wrong for Docker users (3000).
  - A "start minimised" setting was stored but never used.
  - No capture features: no share, quick capture or drag-to-dock. It was just a URL wrapper.
- **Better options today:** the PRD drops Electron. For the native macOS app:
  - Sparkle updates with a visible prompt.
  - Universal Links plus `eclaire://item/<id>` emitted everywhere.
  - A menu-bar quick capture.
  - A user-configurable global hotkey (e.g. the KeyboardShortcuts library).
  - Share extension and Services.

  Until then, the PWA covers "app-like" needs (installable, badge, push).
- **PRD refs:** [CLIENT-1], [APPLE-2], [APPLE-3], [APPLE-8], [DESK-1], [PWA-1], [ORG-3] `eclaire://item/<id>`.

### CLI UX
- **User intent:** scriptable admin and power-user access, the same capabilities as the web app.
- **Capabilities (must be possible):** (v0.7 specifics, "what was pleasant": Appendix A.20)
  - Run first-run setup interactively from the terminal, with visible progress. [CLI-3]
  - Diagnose the instance per subsystem, with the exact recovery command for their environment and optional parts marked as optional. [CLI-3] `doctor`
  - Type commands quickly, with short aliases.
  - Script commands: machine-readable output, and skipping confirmations deliberately on destructive commands. [CLI-3]
  - Run the CLI from the host against a containerised instance, including in pipes.
  - Import a model from a catalogue URL. §5.1
  - Manage local inference engines where the deployment runs them.
  - Chat from the terminal with streaming output, reasoning, tool calls, approvals and slash commands, and abort a run cleanly. [CLI-3], [CLI-5]
  - **[Rule RULE-UX-17]** In machine-readable mode, stdout MUST carry only the data (banners and progress go to stderr), and every command MUST exit non-zero on failure, so scripts and agents can rely on it.
- **Known problems in v0.7 (what was not pleasant):**
  - Most commands wrote the DB directly and needed the master key.
  - API commands relied on the broken localhost trust.
  - A decorative banner was printed to stdout even with `--json`, which broke pipes.
  - Exit code was always 0 after parsing, so scripts could not detect failure.
  - The version was hard-coded.
  - No backup, restore, upgrade, items or tasks commands.
  - CLI chat could not handle approvals; the run would stall or fail (inferred).
  - Two different spinner libraries.
- **Better options today:**
  - API-only CLI generated from the OpenAPI spec.
  - Banners and progress on stderr, data on stdout.
  - Meaningful exit codes.
  - `--json` everywhere.
  - Device-code login.
  - A shared stream reducer, so the TUI renders approvals.
  - Ink is still a good choice for the TUI.
- **PRD refs:** [CLI-1]–[CLI-5], [INTEROP-1a].

---

## Candidate fixtures

Paths are in the v0.7 repo. Use them as sources of cases; do not copy them.

| Path | What it exercises |
|---|---|
| `apps/backend/src/tests/integration/tasks.actions.test.ts` | start, retry, cancel, pause, resume, approve and request changes (the Inbox action state machine) |
| `apps/backend/src/tests/integration/tasks.scheduling.test.ts`, `tasks.recurrence.test.ts` | one-time and cron schedules, max occurrences, next-occurrence maths |
| `apps/backend/src/tests/integration/tasks.edge-cases.test.ts` | overdue checker selection, delegate-mode defaulting |
| `apps/backend/src/tests/integration/tasks.comments.test.ts` | a human comment triggering a revision run; agent-attributed comments |
| `apps/backend/src/tests/integration/all.test.ts`, `tags.test.ts` | cross-kind views (due now, pinned, flagged, pending); tag lowercasing and de-duplication; popular tags |
| `apps/frontend/src/hooks/tests/use-due-now-count.test.tsx`, `use-upcoming.test.tsx` | Due Now badge; Coming Up selection and the "when" fallback |
| `apps/frontend/src/hooks/tests/use-conversations.test.tsx` | Today / Yesterday / This Week / Older grouping |
| `apps/frontend/src/lib/tests/content-links.test.ts` | item-link detection in agent replies |
| `apps/frontend/src/lib/tests/streaming-client.test.ts` | stream event types; a seed for golden agent-stream vectors |
| `apps/frontend/src/lib/tests/cron-utils.test.ts`, `date-utils.test.ts` | recurrence and date helpers |
| `packages/core/src/tests/slash.test.ts` | slash parsing, ranking, aliases, help text: a golden spec for shared commands |
| `packages/channels/core/src/tests/` (split-message, rate-limiter, circuit-breaker, retry) | split order, limits, backoff and jitter, breaker thresholds |
| `packages/channels/{telegram,slack,discord}/src/tests/stream-sender.test.ts` | edit-stream throttle, rollover and error paths against fake transports: the best seed for a channel conformance kit |
| `packages/channels/slack/src/tests/incoming.test.ts`, `message-utils.test.ts` | Slack inbound matrix (mention modes, threads, debounce, dedup); mrkdwn escaping |
| `packages/channels/discord/src/tests/incoming.test.ts`, `commands.test.ts` | attachment host filter, ephemeral command flows |
| `packages/channels/*/src/tests/config.test.ts` | config validation, including Telegram chat-ID formats |
| `apps/backend/src/tests/unit/channel-routing.test.ts` | `@handle` parsing and slug forms |
| `apps/backend/src/tests/integration/channels.test.ts` | channel CRUD, validation, the 255-character name limit, notification fan-out |
| `tests/upgrade-scenarios.sh` (`--dev`, `--container`, `--local`) | the upgrade-gate matrix: fresh, upgrade needed, blocked, downgrade |
| `apps/backend/src/tests/unit/upgrade-steps.test.ts` | blocked and manual upgrade-path registry |
| `apps/backend/src/tests/unit/admin.test.ts`, `integration/admin.test.ts` | admin promotion and user lifecycle (suspend, reactivate) |
| `tests/e2e/bookmarks.spec.ts` (+ `helpers/auth.ts`, `helpers/polling.ts`) | the only Playwright e2e test: UI login, capture, waiting for processing |
| `apps/backend/src/tests/fixtures/{documents,photos}` | sample upload files |

Gaps worth filling in the rebuild:
- onboarding (no tests existed)
- Inbox end-to-end
- approval flows on every surface
- keyboard navigation
- upload limits agreeing between client and server

---

## Appendix A: v0.7 UI inventory (not a spec)

> Recorded so nothing is lost. The new UX is designed from the capability checklists, the PRD and a fresh design pass; do not use this appendix as input to UI design.

### A.1 Task status, delegation and review (UI parts)
- **[v0.7 choice]** The "Awaiting Review" composite status used an eye icon in amber.
- **[v0.7 choice]** The delegate mode was shown as a single checkbox, **"Require review before completing"** (checked = assist, unchecked = handle). It appeared only when the assignee was an agent.
- **[v0.7 choice]** When an agent run produced no text output, the review banner said "No text output was produced. Check the Execution History tab".
- **[v0.7 choice]** The task detail page had an amber banner, "Agent output needs review", showing the latest result summary (a 500-character truncation) in a scrollable box with an **Approve** button. The banner text said "Add a comment below to request changes, or approve to complete".
- **[v0.7 choice]** Delegated tasks had two tabs: **Comments (n)** and **Execution History**. Manual tasks showed comments only.

### A.2 Inbox (UI parts)
- **[v0.7 choice]** Each card showed: title, reason text, due date, next occurrence, latest result or error summary, schedule summary and tags.
- **[v0.7 choice]** Empty sections were hidden.
- **[v0.7 choice]** Each section header showed an uppercase title with a count badge.
- **[v0.7 choice]** The fully empty state read "Inbox clear. Nothing needs your attention right now." with a "Go to Tasks" button.
- **[v0.7 choice]** The sidebar showed the Inbox badge count, capped at "99+".

### A.3 Recurrence UI
- **[v0.7 choice]** The recurrence picker (built but never wired into any screen) offered:
  - Patterns: None, Daily, Weekdays (Mon–Fri), Weekly (the weekday of the due date, or today), Monthly (the day of month of the due date, or today), and Custom (every N days, weeks with a weekday checklist, or every N months).
  - A time field (default 09:00), an optional end date and an optional maximum count.
  - A "run immediately" checkbox.
  - A live preview: "Every weekday at 09:00 until 12/31/2026 (max 10 times)".
- **[v0.7 choice]** The web create/edit form had title, description, status, priority, due date, assignee and tags.

### A.4 Task list views, filters and sorting
- **[v0.7 choice]** Saved quick views: **All**, **Assigned to Me** (manual mode), **Agent Tasks** (assist or handle), **Needs Review** (attention = needs review), **Recurring**, **Completed**.
- **[v0.7 choice]** Filters: Status, Priority, Assignee (people and agents together, with stale assignees kept in the list), and tag.
- **[v0.7 choice]** Sort options: Due Date (grouped by date buckets), Status, Priority and Title.
- **[v0.7 choice]** List and tile view modes.
- **[v0.7 choice]** The "Coming Up" items used distinct icons: recurring (refresh), agent-delegated (bot), one-time reminder (bell), plain task (checkbox).
- **[v0.7 choice]** The assignee picker was a single search box, "Search people and agents".

### A.5 Pin, flag, tags and Pending (UI parts)
- **[v0.7 choice]** The flag used a flag icon tinted with its colour (grey when unset).
- **[v0.7 choice]** Popular tags were shown in the sidebar under the navigation, linking to `/all?tag=<name>`.
- **[v0.7 choice]** Pending Accept showed the toast "<title> has been accepted"; Reject showed "has been rejected and deleted".

### A.6 Built-in views
- **[v0.7 choice]** View rules:

  | View | Rule (v0.7) | Notes |
  |---|---|---|
  | All | every item of every kind, newest first (created time desc, then id desc) | filters: kind, tag, flag colour; text search; `?tag=` deep link |
  | Pending | review status = `pending` | Accept / Reject actions inline |
  | Due Now | due date ≤ end of today (overdue or due today) | subtitle "Items that are due today or overdue"; the top-bar indicator showed its count and linked here |
  | Pinned | pinned = true | |
  | Flagged | any flag colour set | extra colour filter |

- **[v0.7 choice]** Sidebar order: Dashboard, Processing, Upload | All, Pending, Due Now, Pinned, Flagged | Inbox | Tasks, Notes, Bookmarks, Documents, Photos, Media, History.
- **[v0.7 choice]** The Due Now badge counted up to 100 items. It refreshed on realtime events, falling back to polling every 5 minutes when disconnected.
- **[v0.7 choice]** Each view had a tailored empty state ("Flag important items to track them here.").

### A.7 Dashboard widgets
- **[v0.7 choice]** **Asset overview cards:** count and formatted storage size per kind (tasks, notes, bookmarks, documents, photos, media) and in total.
- **[v0.7 choice]** **Quick stats:** Pinned, Pending Review and Flagged totals, each linking to its view. A processing-count field also existed.
- **[v0.7 choice]** **Coming Up:** the next 6 tasks with a due date ≥ now, sorted by due date ascending. The "when" shown was the next occurrence, else the due date, else the created time. Relative labels: "Overdue", "< 1 min", or a short date.
- **[v0.7 choice]** **Activity timeline:** items added per day by kind, over 7 or 30 days, with totals.
- **[v0.7 choice]** **Storage usage chart:** a breakdown by kind.
- **[v0.7 choice]** **Recent Activity:** the latest history entries, with a link to the History page.
- **[v0.7 choice]** **Processing Jobs:** a summary of the processing queue.

### A.8 History filters
- **[v0.7 choice]** Filters: action (create, update, delete, `api_call`); item type (task, bookmark, document, photo, api); **actor type (human, agent, system, service)**; text search.
- **[v0.7 choice]** Human-readable lines, e.g. `Commented on "<task>"`, `Performed <action> on <type> "<name>"`.
- **[v0.7 choice]** The mobile filter button showed a badge with the number of active filters.

### A.9 Assistant presentations
- **[v0.7 choice]** **Docked right panel:** default width 384 px, draggable between 280 and 800 px. The resize handle was keyboard-operable (arrow keys changed the width by 20 px). It was hidden on mobile.
- **[v0.7 choice]** **Full screen:** a 90vw × 90vh modal that did not close on outside click. "Exit full screen" returned to the panel; "Close" closed the assistant and cleared pre-attached items.
- **[v0.7 choice]** **Floating launcher:** a 64 px round button at bottom-right. Its radial menu offered four actions: Upload Document, Assign Task (opened the AI task dialog), Windowed Chat and Full Screen Chat. It was shown only while the assistant was closed and the "Show assistant overlay" preference was on (default on). An attention animation played until the first interaction.
- **[v0.7 choice]** **Sidebar AI mode:** ⌘/Ctrl+Shift+E switched the left rail between Content and AI. AI mode listed agents with status dots (running > error > unread-completed); conversations grouped Today / Yesterday / This Week / Older (last 30); and an activity feed of sessions that were running (amber, pulsing), errored (red) or had an unread completed reply (green).
- **[v0.7 choice]** **Mobile:** a bottom tab bar with Chat / Lists / Settings.
- **[v0.7 choice]** **Panel header:** an agent switcher; the conversation title, editable inline (Enter saved, Esc cancelled; max 200 characters); buttons History, New, Full screen, Close.
- **[v0.7 choice]** **Agent binding:** a conversation was bound to one agent, so switching agent started a new conversation. Conversations were created lazily on the first message.
- **[v0.7 choice]** The welcome message was client-only. With an attached item it read: `I can see you've attached "<title>"… How can I help you with it today?`

### A.10 "Chat about this"
- **[v0.7 choice]** Every list row, tile and detail page of every kind had "Chat about this <kind>". It opened the panel with that item attached as a chip ("Attached to conversation:", with a kind icon and a remove button).
- **[v0.7 choice]** Attached items were re-sent as context on every turn of that conversation. They were cleared when another conversation was loaded or a new one started.
- **[v0.7 choice]** The server inlined each attached item's content into the prompt.

### A.11 Content-link previews
- **[v0.7 choice]** After a reply finished, item links of the form `/<kind>/<id>` were detected, de-duplicated and rendered as full-width cards linking to the item: bookmark (favicon and hostname), document or photo (original filename), task ("Status: <status>"), note (the title, or the first 60 characters).
- **[v0.7 choice]** Card data was fetched asynchronously after the text rendered.

### A.12 Activity, thinking and approvals
- **[v0.7 choice]** **Progressive disclosure in three levels:**
  1. Collapsed: an "Agent Activity" badge, e.g. `5 steps · 3 tools · 1.2s` (milliseconds under 1 s).
  2. Expanded: a step timeline with step numbers, a timestamp per step, a collapsible thinking block per step, tool rows with status icons, and a terminal "Done" marked "(max steps reached)" or "(aborted)" when applicable.
  3. Click a tool: pretty-printed arguments and result.
- **[v0.7 choice]** Step details loaded lazily only when expanded.
- **[v0.7 choice]** Stored tool input and output were truncated above 50,000 characters.
- **[v0.7 choice]** **Live tool tracker:** statuses starting, executing, completed, error, and **awaiting approval** (amber shield); a completed/total badge, styled as destructive if any tool errored; the section force-expanded while an approval was pending.
- **[v0.7 choice]** **Thinking:** while streaming, a "Thinking…" accordion; afterwards a collapsed "Thought Process" (dashed border, monospace). The toggle sat in Settings → Assistant, "Show thinking process". It was disabled with "(Not supported)" when the default model's thinking mode was `never`. Model thinking modes: `always`, `never`, `prompt-controlled`, `provider-controlled`.
- **[v0.7 choice]** **Approvals:** shown inline on the tool row, "Requires approval to execute", with [Deny] [Approve]. Deny turned the tool into the error "Denied by user". Tools that required approval by default: every delete, send notification, and admin writes.
- **[v0.7 choice]** Streaming text was batched per animation frame when chunks arrived less than 16 ms apart.
- **[v0.7 choice]** After a completed reply, TTS auto-played if enabled; there was also a per-message play button.

### A.13 Conversation history
- **[v0.7 choice]** The history dialog showed the 50 most recent conversations of the current agent: title (default "New session"), message count and last-message time.
- **[v0.7 choice]** Actions: Open (marked it read), Delete one, **Delete All Conversations** (with a confirmation), and Rename (from the header).
- **[v0.7 choice]** Unread state: conversations with a reply the user had not seen were flagged, and marked read on open or at stream end.
- **[v0.7 choice]** **Title heuristic (no LLM):**
  1. Collapse whitespace in the first user message.
  2. If it is 50 characters or fewer, use it whole.
  3. Otherwise cut at the first `. `, `? ` or `! ` between characters 20 and 50.
  4. Otherwise truncate at a word boundary near 47 characters and add an ellipsis.

### A.14 Slash commands
- **[v0.7 choice]** Full v0.7 list:

  | Command | Intent | Notes |
  |---|---|---|
  | `/new` | start a new conversation | |
  | `/clear` | clear and start fresh | the CLI cleared only the screen and kept the session; channels deleted the session and created a new one |
  | `/history` | list recent conversations | CLI and channels: last 10, as "id8 — title (N msgs)"; channels cut titles to 40 characters |
  | `/model` | show the current model | |
  | `/thinking` | toggle thinking | channels exposed it as `/settings` (bug) |
  | `/help` | list commands | |
  | `/exit` | quit | CLI only |
  | `/agent <name>` | switch agent (match on id or name, case-insensitive) | errors: "Usage: /agent <name>", `Unknown agent "x". Available: …` |
  | `/<agentName>` | shortcut to switch agent | intended to accept a one-shot prompt, never implemented |
  | `/skill <name> [task]`, or `/<skillName> [task]` | use one of the active agent's skills | without a task, inserts the scaffold `/skill <name> ` into the composer; with one, sends `Use the "<skill>" skill to: <task>` |

- **[v0.7 choice]** **Palette behaviour:** opened when the input started with `/`. Groups appeared in this order: Commands, Agents (excluding the active one), Skills. Matching was a case-insensitive prefix match on id or label, exact matches first, then shorter ids. Up/Down wrapped around, Tab selected, Esc cleared.

### A.15 Keyboard shortcuts
- **[v0.7 choice]** Complete v0.7 list:

  | Scope | Keys | Action |
  |---|---|---|
  | Global | ⌘/Ctrl+B | collapse or expand the left sidebar (persisted) |
  | Global | ⌘/Ctrl+Shift+E | toggle the sidebar between Content and AI mode (desktop app: the same chord was the OS-level "show window" shortcut) |
  | Lists (all kinds) | ↑ ↓ ← → | move focus; in tile view ↑ and ↓ jump a row |
  | Lists | Home / End | first / last item |
  | Lists | Enter or Space | open |
  | Lists | `e` | edit |
  | Lists | Delete or Backspace | delete (with confirmation) |
  | Lists | Esc | clear focus |
  | Photo lightbox | → or Space / ← | next / previous (touch swipe also works) |
  | Photo lightbox | Esc | close |
  | Photo lightbox | Enter | edit |
  | Photo lightbox | Delete or Backspace | delete |
  | Composer | Enter / Shift+Enter | send / new line (auto-grows to 120 px) |
  | Slash palette | ↑ ↓ (wrapping), Tab, Esc | move, select, clear |
  | Inline edits (title, tags, URL import) | Enter / Esc | confirm / cancel |
  | CLI chat | Ctrl+C | abort the run server-side and exit |

### A.16 Uploads
- **[v0.7 choice]** **Universal upload page:** multi-file drag and drop, Browse, and **Folder upload** (keeping the relative path of each file). **Paste** of clipboard *files* anywhere on the page, with a "pasted" indicator for 2 s; text pastes passed through.
- **[v0.7 choice]** Files were queued and uploaded one at a time to the universal capture endpoint, which auto-detected the kind. Metadata sent with each file: name, size, MIME type, last-modified, relative path, extension, and source (`clipboard` or `file-system`). Progress showed total files, total size and how many were uploaded.
- **[v0.7 choice]** **Per-kind pages accepted drops onto the page itself:**

  | Kind | Limit | Accepted | Notes |
  |---|---|---|---|
  | Notes | 1 MB per file | `.txt`, `.md`, `.json` | the title is the filename without its extension; JSON is wrapped as `# name` plus a fenced json block; server error: "Supported types: TXT, MD, JSON" |
  | Bookmarks import | 5 MB, single file | Chrome/Brave JSON export only | toast "Imported X bookmarks. Y queued for processing."; server error: "Please upload a Chrome or Brave bookmark file." |
  | Photos | 25 MB (client) | jpeg, png, gif, webp, heic/heif, avif, svg, tiff, bmp | |
  | Documents | 50 MB | pdf, doc/docx, xls/xlsx, ppt/pptx, txt, rtf, md, html, csv, json, xml, pages, numbers, keynote | |
  | Media | 500 MB (client) | mp3, wav, flac, ogg, aac, m4a, aiff, webm, mp4, mov, avi, mkv, ogv, mpeg | |
  | Avatar | 5 MB | PNG, JPG, GIF | |

- **[v0.7 choice]** URL downloads in processing were capped at 500 MB.

### A.17 Onboarding wizard
- **[v0.7 choice]** Steps in order:

  | # | Step | Intent |
  |---|---|---|
  | 1 | welcome | orientation |
  | 2 | claim admin | create the admin account |
  | 3 | choose preset | pick a provider preset |
  | 4 | configure provider | set up the provider |
  | 5 | select models | choose the models |
  | 6 | health check | verify everything works |
  | 7 | registration policy | decide who can sign up |
  | 8 | summary | confirm and finish |

  Overall status: `not_started`, `in_progress` or `completed`.
- **[v0.7 choice]** Derived completion checks: "Claim admin" was done if an admin existed; "Configure provider" when at least one provider existed; "Select models" when at least one model existed and a chat-role model was selected; "Health check" once it had been run at least once; "Registration policy" once it was set.
- **[v0.7 choice]** The server enforced step ordering: `Cannot advance to "X": step "Y" is not complete`.
- **[v0.7 choice]** Finishing was refused without an admin, a provider, a model and a chat-model selection, with specific errors, e.g. "Cannot complete onboarding: no admin account exists. Create an admin first."
- **[v0.7 choice]** Changing preset kept the existing providers and warned: "Changing preset will not remove existing providers. Remove them manually if needed."
- **[v0.7 choice]** Applying a preset was transactional, and providers created by a failed apply were rolled back.
- **[v0.7 choice]** Reset cleared onboarding progress only; providers and models were preserved, and the user was told so.
- **[v0.7 choice]** **Upgrade safety:** an already-configured instance with no onboarding record was auto-marked completed at startup.
- **[v0.7 choice]** Presets:

  | Preset | Kind | What it sets up |
  |---|---|---|
  | llama.cpp dual model | local | two servers, chat on port 11500 and processing on 11501; "Best for dedicated GPU setups" |
  | Ollama | local | single server for both roles |
  | OpenRouter | cloud, key required | "Fastest setup — just add an API key" |
  | OpenAI | cloud, key required | |
  | Custom | advanced | OpenAI-compatible base URL and an optional key |

- **[v0.7 choice]** Base URLs were editable and showed the default.
- **[v0.7 choice]** Model roles: *chat/assistant* and *processing*. Hint: "Vision-capable models are recommended so Eclaire can process documents." If the chosen cloud model lacked vision, a second "Document Processing Model" picker appeared, filtered to vision-capable models. If no processing model was picked, processing fell back to the chat model.
- **[v0.7 choice]** **Health check** ran in parallel: a DB query, the document converter's `/health` (5 s timeout), a connection test per provider, and a report of the role selections. Critical meant the DB was OK and at least one provider was OK; the button then read "Continue", otherwise "Continue Anyway". The check never hard-blocked. Optional services warned rather than failed, e.g. "Docling is not reachable. Document processing will be unavailable."
- **[v0.7 choice]** **Registration policy:** open ("Anyone with the link can create an account") or admin-only ("Only admins can create accounts for new users"). The default was open, and an unset value also meant open. When closed, sign-up returned `REGISTRATION_DISABLED`. Suspended users got `ACCOUNT_SUSPENDED`.
- **[v0.7 choice]** Admin form validation, the same in web and CLI: name of 2 or more characters, a valid email, a password of 8 or more characters, and a matching confirmation.
- **[v0.7 choice]** Welcome copy listed what would be set up: admin account, AI backend (local or cloud), provider and models, verification, registration policy.
- **[v0.7 choice]** The summary ("You're All Set!") suggested three first actions: save a bookmark, upload a document, open the assistant.
- **[v0.7 choice]** Routing: with zero users, `/` led to setup; unauthenticated visitors to setup were sent to login and back; non-admins were sent to the dashboard; admins were redirected to setup until it was complete; if the state fetch failed, setup still rendered ("API might be starting up").
- **[v0.7 choice]** **CLI parity:** `onboard` (alias `setup`) with `--preset` and `--reset` drove the same server state machine with clack-style prompts. Messages: "Cannot reach the Eclaire backend…", followed by the exact Docker and dev start commands; "Eclaire is already configured. Run `eclaire doctor` to check health."; "Eclaire is ready! Open <url> to get started."

### A.18 Settings
- **[v0.7 choice]** Sections lived at `/settings/<section>`, with old tab names redirecting.
- **[v0.7 choice]** **Profile:** avatar upload (5 MB) and avatar colour; display name (50 characters), full name (100), bio (500), city and country (50 each); **time zone**, auto-detected when unset.
- **[v0.7 choice]** **Account:** change password; connected accounts (X); a danger zone where "Delete All Data" kept the account and "Delete Account" removed it, both requiring the password.
- **[v0.7 choice]** **Appearance:** "Show popular tags" and "Number of tags to show" (1–50). The theme toggle lived in the top bar.
- **[v0.7 choice]** **Assistant:** "Show thinking process" and "Show assistant overlay".
- **[v0.7 choice]** **Voice:** speech-to-text and text-to-speech provider, model, streaming and speed (covered elsewhere).
- **[v0.7 choice]** **Tools:** catalogue with status (Disabled, Setup Required) and access level, plus a parameter detail sheet.
- **[v0.7 choice]** **Skills:** catalogue with scope and tag, plus help for adding custom SKILL.md files.
- **[v0.7 choice]** **MCP servers (admin):** name, ID and description; transport (stdio, HTTP or SSE) with the command or URL and its arguments; connect timeout; tool mode (Grouped, Individual or Managed); enabled.
- **[v0.7 choice]** **Browser control (admin):** availability, signed-in browser access, active tab.
- **[v0.7 choice]** **Channels:** add, edit, enable and disable, as in §5. Cards showed "Bidirectional", "Receive Only" or "Send Only".
- **[v0.7 choice]** **API keys:** keys could be issued for the user, for each of their agents, and for "External systems"; name, data access (`read` or `read_write`) and admin access (`none`, `read` or `read_write`); keys shown only once; created and last-used dates.
- **[v0.7 choice]** **Models (admin):** add a model manually, from the catalogue, or by importing a URL; capabilities; default assignments "Backend (text-only)" and "Workers (text + vision)".
- **[v0.7 choice]** **Providers (admin):** quick-setup presets; ID and base URL; dialect (OpenAI-compatible, Anthropic Messages, MLX native or CLI JSONL); auth (none, bearer token, or a custom header).
- **[v0.7 choice]** **Users (admin):** add a user (email, name, password of at least 8 characters, role), list users with role, status and join date, and the "Allow new user registration" toggle.
- **[v0.7 choice]** **About:** version, full version, git hash, build date, build environment and uptime.
- **[v0.7 choice]** Preference storage was split three ways: thinking and overlay toggles, plus per-page view preferences (sort, list or tile), lived in the browser's localStorage; voice preferences were stored on the server, with a one-time migration from localStorage.

### A.19 Desktop shell
- **[v0.7 choice]** **Deep links:** `eclaire://open/<path>` opened `<server>/<path>` in the app window and focused it, e.g. `eclaire://open/notes/123`. It was the only route handled.
- **[v0.7 choice]** **Single instance:** a second launch focused the existing window. Deep links on Windows and Linux arrived through second-instance arguments.
- **[v0.7 choice]** **Tray menu:** "Open Eclaire"; "Server: <url>" (informational, disabled); a separator; "Quit Eclaire" (a real quit, bypassing hide-on-close). Clicking the tray showed the window.
- **[v0.7 choice]** **Global shortcut:** `CmdOrCtrl+Shift+E` showed and focused the window. It was not configurable.
- **[v0.7 choice]** **Auto-update:** downloaded in the background and installed on quit. It checked at launch and every 4 hours.
- **[v0.7 choice]** **Window:** bounds were remembered (default 1280×800, minimum 800×600); on macOS, closing hid the window rather than quitting; external links opened in the system browser; the window was shown only once ready (no white flash); a 40 px drag region sat at the top.
- **[v0.7 choice]** **Server selection:** on launch it checked `<url>/health` (5 s timeout). On failure it showed a "Connect to Eclaire" screen asking for the server URL, which was then stored.

### A.20 CLI UX
- **[v0.7 choice]** Wizard-style prompts with spinners for onboarding.
- **[v0.7 choice]** `doctor` printed ✓/⚠/✗ per subsystem with the *exact* recovery command for each environment (Docker vs dev). Optional components were labelled "(optional)".
- **[v0.7 choice]** Short aliases for every group: `prov`, `m`, `ch`, `cfg`, `e`.
- **[v0.7 choice]** `--json` on list commands. `--force` to skip confirmations on destructive commands.
- **[v0.7 choice]** A host wrapper (`./eclaire <cmd>`) ran the CLI inside the container, switching to non-TTY mode when piped.
- **[v0.7 choice]** Model import from a HuggingFace or OpenRouter URL, with GGUF metadata refresh.
- **[v0.7 choice]** Local inference engine management (`engine up/down/logs/pull/doctor`) with VRAM and memory estimates. It was hidden in container mode.
- **[v0.7 choice]** **Chat TUI:** streaming markdown, a collapsible thinking block, tool-call display and a status bar; a slash-command menu (Up/Down to move, Tab to complete, Esc to close); Ctrl+C aborted the run server-side, then exited; flags `--no-thinking`, `--no-tools`, `--conversation <id>` and `--no-stream`.

---

## Appendix: v0.7 prompts (eval baseline only, not a template)

- **Agent task-tool guidance:**
  - "Everything is a task. Use createTask for work items, reminders, scheduled agent runs, and recurring tasks."
  - "For a reminder: set scheduleType='one_time', scheduleRule=ISO datetime, deliveryTargets=[{type:'notification_channels'}]."
  - "For recurring agent work: set scheduleType='recurring', scheduleRule=cron, delegateActorId=agent, delegateMode='handle'."
  - "For one-time agent work: set delegateActorId=agent, delegateMode='assist' (review) or 'handle' (auto-complete)."
  - "Always confirm with the user before creating tasks."
- **System-prompt time rule:** "Convert relative times to absolute ISO 8601 using the current date/time and user timezone." The user's time zone was appended to the user-context section.
- **Notification tool guidance:** "Always confirm with the user before sending notifications." "Describe which channels will receive the message."
- **Task run fallback prompts:** `Work on the task: <title>` (initial run) and `Revise the task: <title>` (after a human comment).
- **Skill invocation rewrite:** `Use the "<skill>" skill to: <task>`.
- **Tagging (adjacent area):** "generate a list of maximum 5 relevant tags as a JSON array" over content capped at 8,000 characters for bookmarks.
