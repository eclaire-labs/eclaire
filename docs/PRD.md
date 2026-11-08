# Eclaire: Product Requirements for the Rebuild

**Status:** Draft 1 · **Date:** 2026-11-07 · **Audience:** the engineering team and their coding agents
**Companion:** [REVIEW.md](./REVIEW.md), a review of the v0.7 codebase and the evidence behind most decisions here.
**Backward compatibility:** None. v0.x is assumed to have no users. There is no migration, no importer and no compatibility with v0.x APIs, schemas or configuration. v1 is versioned from `1.0.0-alpha.N`.

---

## 0. How to read this document

- **Normative language** follows RFC 2119. MUST and MUST NOT are hard requirements. SHOULD means a strong default that can be departed from with a written rationale. MAY is optional.
- **Requirement IDs** take the form `[AREA-n]`. Use them in tickets, PRs, tests and agent prompts.
- **Priority:**
  - **P0** is required for the first usable release ("v1").
  - **P1** is a fast follow.
  - **P2** is later, but the design MUST NOT preclude it.
  - Untagged requirements are P0.
- **Sections 1–12 state requirements and are technology-agnostic.** §13 gives technology *recommendations*. Those are advisory and owned by the engineering team.
- **Appendix B** sketches the extension contracts as TypeScript-like pseudocode. Treat them as the shape to aim for, not as final signatures.
- **Appendix C** lists behavioural rules carried over from v0.7. They are binding, like body requirements. The `reference/` notes are optional background and are never needed to understand a requirement.

---

## 1. Product summary

### 1.1 What Eclaire is

Eclaire is a **private, self-hostable system that captures and understands a person's or a small group's information, and runs AI agents that act on it**. It works through any surface (web, mobile, CLI, chat apps, voice), with any model (local first), and it is open to any outside agent harness.

It has two planes on one kernel:

```
┌──────────────────────────────── Surfaces ────────────────────────────────┐
│  macOS app · iOS app · Web · CLI · Telegram/Slack/Discord/… · Voice       │
│  External harnesses (Claude Code, Codex, Cursor, …) · Scripts & webhooks  │
└──────────────┬──────────────────────────────────────────────┬────────────┘
   Edge hosts (Mac/iOS apps, `eclaire-edge` daemon): run Sources & local
   processors where the data lives (files, Photos, Reminders, Notes, mail)
               │ REST/OpenAPI · MCP · Event stream · Sync     │ Agent stream (AG-UI-style)
┌──────────────▼───────────────┐              ┌───────────────▼─────────────┐
│          DATA PLANE          │              │         AGENT PLANE         │
│  Capture → Process →         │  tools &     │  Agents · Threads · Runs    │
│  Index → Organize →          │◄────────────►│  Tools · Approvals · Memory │
│  Sync → Expose               │  events      │  Tasks · Triggers · Voice   │
└──────────────┬───────────────┘              └───────────────┬─────────────┘
               └──────────────────────┬───────────────────────┘
┌─────────────────────────────────────▼────────────────────────────────────┐
│ KERNEL: Identity & policy · Item store · Blob store · Event log/outbox ·  │
│ Durable jobs · Extension registry · Config & secrets · Observability      │
└───────────────────────────────────────────────────────────────────────────┘
```

**Data plane.** Anything a user captures, or **links** from where it already lives (files on a Mac, a Photos library, a mailbox, a Drive), becomes an **Item** of some **Kind** inside a **Space**, such as "Personal" or "Work". **Processors** derive **Artifacts** from it (text, renditions, metadata, transcripts, tags, embeddings). The plane indexes items for hybrid search, organises them (tags, collections, links), syncs them to offline-capable clients, and exposes them equally to humans, Eclaire agents, external agents and programs.

**Agent plane.** **Agents** are first-class principals with their own permissions. They hold **Threads** with users and execute durable **Runs** that call **Tools**, subject to **Approval policy**. **Tasks** and **Triggers** let humans hand work to agents, on demand, on a schedule, or in response to events, and review the results. The harness works across every surface, and it is swappable: an external harness can drive Eclaire's data and tools, and Eclaire's agents can be called from outside.

### 1.2 Why rebuild

v0.7 proved the product: unified capture, AI processing, an assistant with tools, and tasks delegated to agents. It did so on a foundation that resists extension. Every content type is hand-wired in dozens of places. Pipelines are imperative code. Agent tools are locked inside the process. Critical state lives in memory. Protocols are bespoke. Security has a bypass that authenticates anonymous requests. Offline does not exist. See REVIEW.md §4.3.

The rebuild keeps the concepts and replaces the foundation.

### 1.3 Goals

| ID | Goal | Measured by (§1.7) |
|---|---|---|
| G1 | **Extensible by construction.** New data kinds, processors, tools, channels, voice and model providers, notification targets and UI views can be added as extensions. First-party features use the same extension API. | S1, S2 |
| G2 | **Data equally available** to the UI, Eclaire agents, external agents (MCP) and programs (API, events, webhooks). | S3 |
| G3 | **Private by default.** Local models and local storage, explicit per-provider egress policy, and no user content in logs. | S6 |
| G4 | **Durable and correct.** Nothing a user can see exists only in memory. Restarts lose nothing, and every stream is resumable. | S4 |
| G5 | **Offline-capable clients.** Read, search and capture without a connection, with sync on reconnect. | S5 |
| G6 | **Runs on a laptop or NAS in one command, and scales out with no loss of features.** | S7 |
| G7 | **Safe to expose** behind a standard reverse proxy with TLS, SSO or 2FA, and rate limits. | S8 |
| G8 | **Index in place, not just import.** Eclaire can link to data that stays in its system of record (local folders, Photos, Notes, Reminders, mail, cloud drives), keep it continuously up to date, and act on it with approval and undo. | S9 |
| G9 | **Works great everywhere through a responsive, installable web app first**, then a best-in-class native experience on macOS (and later iOS) that uses platform features such as share sheets, Shortcuts, Spotlight, widgets and on-device AI. | S10, S11 |

### 1.4 Non-goals (for the rebuild's v1)

- Hosted SaaS or large-scale deployments. **Target: self-hosting for single users, families and small teams** (1–50 users per instance). A hosted offering may come one day, so keep data access behind repository interfaces, but no work goes into it now (decision log §12).
- Training models, or writing our own inference engine. Eclaire **does** install, run and manage a proven local engine and its models out of the box (§5.1a). It also works with inference servers the user already runs.
- Real-time collaborative editing in the style of Google Docs. Field-level sync conflicts are in scope; CRDT text editing is P2.
- Becoming a full email or calendar client. Sources MAY link or import email and calendar data as items.
- Compatibility with v0.x APIs, schemas or configuration.

### 1.5 Personas

1. **Owner / self-hoster.** Technical. Installs and administers the instance, picks models, and cares about privacy.
2. **Member.** May be non-technical. Uses web, mobile, Telegram or voice to capture and ask. Could be a household member or teammate.
3. **Agent builder.** Defines agents, toolsets, skills and automations.
4. **External-harness user.** Points Claude Code, Codex, Cursor or another MCP client at their Eclaire data.
5. **Extension developer.** Ships a kind, processor, source, channel or tool pack.
6. **Instance admin.** Manages users, providers, quotas, backups and upgrades. Often the same person as the owner.

### 1.6 Representative use cases

These carry over from v1 unless marked new.

1. Save a link from phone, desktop or chat. Get a clean readable copy, an archival PDF or screenshot, tags and a summary. Special handling applies to sites such as GitHub, Reddit and X.
2. Drop a folder of mixed files (PDF, Office, iWork, images, HEIC, audio, video). Each is classified, converted, OCR'd or transcribed, tagged and made searchable.
3. Dictate a note from a watch or chat app. It becomes a note with transcript and audio, and the agent may act on it.
4. Ask: "what did the plumber quote last spring?" The answer cites the items it came from. *New:* semantic retrieval and citations at chunk level.
5. Assign a task to an agent in **assist** mode, review the output, request changes, approve.
6. Set up an automation: "Every Monday 8am, summarise my week's tasks to Telegram." *New:* event triggers, such as "when a bookmark from arxiv.org is saved, summarise it into a note."
7. *New:* open Claude Code, connect the Eclaire MCP server with a scoped key, and have it search, read and file items.
8. *New:* use the PWA on a plane. Read, search and capture offline; everything syncs on landing.
9. Talk to the assistant hands-free. *New:* full-duplex voice with barge-in.
10. Process sensitive documents (bank, health) only with local models. *New:* this is enforced by an egress policy, not by convention.
11. Migrate data out of Google, Apple or other vendors through Sources and importers. Export everything in an open format at any time.
12. *New:* get one Inbox of everything that needs a human: approvals, reviews, failures, triage, overdue items.

### 1.7 Success criteria

| ID | Criterion |
|---|---|
| S1 | A new item kind that uses only standard facets, with list, detail, search, tools and sync, can be added **in one extension package**, with no edits to core. Target: under 1 day for an engineer or agent. |
| S2 | A new processor, such as "extract recipes from bookmarks", can be added as an extension. Existing items can be backfilled through it without reprocessing anything else. |
| S3 | An external MCP client can list, search, read, create and update items with a scoped credential. Target: 5 minutes from the settings page. |
| S4 | Killing any process mid-run loses no accepted writes, jobs, agent runs or approvals. Clients reconnect and resume streams. |
| S5 | PWA cold-start offline shows synced items. Search works on synced metadata and text. Captures made offline upload on reconnect. |
| S6 | With the default configuration, no user content leaves the host. CI asserts this with a network-egress test. |
| S7 | The same end-to-end test suite passes in all-in-one mode and scale-out mode. |
| S8 | An automated security suite passes: no unauthenticated access, no IP-based trust, rate limits and headers present, SSRF blocked. |
| S9 | A user links `~/Documents` on their Mac. Within minutes the files are searchable without being copied. Renames and edits made in Finder show up within 10 s. An agent-proposed reorganisation is previewed, approved, executed and undoable. |
| S10 | On a Mac: from `brew install eclaire` to a working local instance (web UI) with a first captured item takes under 5 minutes, with no Docker and no manual database setup. The same holds for the Mac app once it ships. |
| S11 | The web app scores at least 90 on Lighthouse PWA and accessibility checks. It installs to the home screen on iOS and Android, accepts shares, receives web push, and every P0 flow works on a 375 px-wide phone screen. |
| S12 | **Time to AI on a Mac.** After the setup wizard, keyword search, OCR and thumbnails work immediately. On a Mac with Apple on-device models available, tagging and summaries work within 1 minute. The full local assistant (chat with tools, vision, semantic search) works as soon as the recommended model bundle has downloaded. During setup the user only makes choices; there are no terminal steps and nothing extra to install. |

---

## 2. Design principles (normative)

1. **[PRIN-1] One model, many kinds.** Every piece of user content is an Item. Cross-cutting behaviour (tags, pin, flag, due, attention, comments, links, history, search, sync, permissions) is implemented once against Item. It MUST NOT be re-implemented per kind.
2. **[PRIN-2] Everything is an extension.** Kinds, processors, tools, sources, channels, voice providers, model providers, notification targets, search backends, blob stores and UI contributions all register through one extension registry. First-party features MUST use the public extension API, with no private back doors.
3. **[PRIN-3] Standard protocols at boundaries.** Use OpenAPI 3.1 for the API, MCP for tools and data to agents, an AG-UI-compatible event stream for agent UI, SKILL.md for skills, CloudEvents-style envelopes for events and webhooks, OAuth 2.1/OIDC for identity, RFC 9457 for errors, and OpenTelemetry for observability. Invent a protocol only where none exists, and document it.
4. **[PRIN-4] Durable state, explicit lifecycles.** Every user-visible process has a persisted record with a state machine: jobs, runs, approvals, deliveries, sync. In-memory structures are caches only.
5. **[PRIN-5] Provenance everywhere, and humans win.** Every field value, tag and artifact records who or what produced it (user, processor@version, model, prompt hash). AI output MUST NOT silently overwrite user-authored values.
6. **[PRIN-6] Least privilege with no bypasses.** Every request, from browser sessions, API keys, agents, CLI, channels or plugins, is evaluated by the same policy engine. There is no IP-based or "localhost" trust.
7. **[PRIN-7] Same semantics in every topology.** All-in-one and scale-out MUST be feature-identical. Topology is a deployment concern, never a code path that changes behaviour.
8. **[PRIN-8] Local-first.** Clients hold a local replica, writes are optimistic, and the server is the source of truth for ordering.
9. **[PRIN-9] Privacy by construction.** No user content in logs by default. Per-provider egress classification is enforced at call time. Encryption at rest is available.
10. **[PRIN-10] Isolate untrusted work.** Converters, browsers, downloaders and third-party plugins run out of process with resource and network limits.
11. **[PRIN-11] Declarative over imperative.** Kinds, pipelines, permissions, settings UIs and saved views are data validated by schemas, not code paths.
12. **[PRIN-12] Observable and evaluable.** Every AI call, job and run is traceable. Pipelines and agents have eval suites.

---

## 3. Domain model

### 3.1 Glossary

| Concept | Definition |
|---|---|
| **Instance** | One deployment. It has admins, settings and providers. |
| **Space** | The hard isolation boundary, e.g. "Personal", "Work" or "Family". A user can own or belong to **many** spaces. Each space has its own policies: egress, models, processors, retention, encryption key. Every data record belongs to exactly one space. Shared spaces with members and roles are P1. See §4.11. |
| **Principal** | Anything that can act. Kinds: `human`, `agent`, `service` (integration or API client), `system` (internal), `plugin`, `device` (an edge host). |
| **Source** | A configured external system of record that Eclaire reads from and optionally acts on: a local folder, Photos library, Apple Notes, Reminders, Gmail, Google Drive, IMAP, RSS and so on. Its **mode** is `import` (one-time copy), `mirror` (continuous copy) or `link` (index in place). Its **host** is where it runs: the server or a specific edge host. See §4.9. |
| **Edge host** | A device running Eclaire client software that can host Sources and local processors: the macOS app, the iOS app, or a headless `eclaire-edge` daemon. It is a `device` principal paired with the instance. See §4.12. |
| **Origin** | On a linked or mirrored item, the reference to its external original: source id, external id, path or URL, external version or etag, last seen, and availability. |
| **Grant** | Permission given to a principal. It names a space, a set of permissions, optional resource constraints (kinds, collections, tags, specific items), an expiry, and who granted it. |
| **Credential** | Proof of a principal's identity: a session, API key, OAuth token, channel identity link or device key. |
| **Item** | The unit of user content: an id, space, kind, core fields, kind-specific `props`, facets, and a revision. |
| **Kind** | A registered item type: a props schema, enabled facets, a capture matcher, a default pipeline, display metadata, generated tools and UI. Built-in kinds: `note`, `bookmark`, `document`, `image`, `media`, `task`. Extensions add kinds such as `contact`, `email`, `recipe`, `memory`. |
| **Facet** | A reusable cross-kind capability with its own fields and behaviour: `schedulable` (due), `workflow` (status, assignee, review), `geo`, `temporal` (event time), `file` (original blob), `web` (source URL), `media` (duration, dimensions). |
| **Blob** | Immutable bytes, addressed by content hash (sha256), with MIME type and size. Blobs are deduplicated within a space. |
| **Artifact** | A derived output attached to an item: extracted text, PDF rendition, thumbnail, transcript, EXIF, OCR, structured extraction, embedding set and so on. It has a kind, a blob or inline value, and a producer (processor id@version, model id, prompt hash, input hashes). |
| **Chunk** | A unit of retrieval: a span of text from an artifact, with lexical and vector index entries and a back-reference for citations. |
| **Suggestion** | A value proposed by AI or a rule for a field or tag, with producer and confidence. It can be accepted, rejected, or auto-accepted by policy. |
| **Tag** | A space-scoped label. The item–tag relation records its source (user, AI, rule, source) and confidence. |
| **Collection** | A named, **nestable** group of items within a space, like a folder or list. It is either *manual* or *smart*, where smart means a saved query. An item can be in many collections. Collections are also used as permission, sync and automation scopes. |
| **Link** | A typed, directed edge between items, or between an item and a thread, message or run. Examples: `references`, `derived_from`, `attachment_of`, `duplicate_of`. |
| **Comment** | A threaded comment on any item, written by any principal. |
| **Change** | A field-level diff of an item, with actor, grant, time and cause (an edit, run or processor). It feeds per-item history and the sync feed. |
| **AuditEvent** | A security-relevant event: auth, permission change, admin action, credential use, egress. This is a separate log from Change. |
| **Event** | A domain event written to the outbox in the same transaction as the change. It feeds the bus, realtime, webhooks and triggers. |
| **Processor** | A registered unit of derivation, declaring what it accepts, what it requires and what it produces. |
| **Pipeline plan** | The DAG of processors that applies to an item. It is resolved from the registry plus policy. |
| **Job / Run / Attempt** | A durable execution record. A Job is a unit of queued work. A Run is a logical execution (one processor on one item, or one agent run). An Attempt is one try at a Run. |
| **Agent** | A principal with a definition: instructions, model policy, toolsets, skills, data grants, approval policy and memory policy. |
| **Thread** | A conversation between principals, usually a human and an agent. It is surface-independent. |
| **Message** | An ordered list of typed **parts**: text, reasoning, tool call, tool result, file or image, citation, approval request or response, system notice. |
| **Agent run** | A durable execution of an agent turn or task. It records steps, tool calls, tokens and cost, and has a state machine. |
| **Approval request** | A persisted request for a human decision about a pending tool call or action. |
| **Task** | An item kind with the `workflow` facet. It carries a status, an assignee (human or agent), a delegation mode (`manual`, `assist`, `autonomous`), a review state, and runs. |
| **Trigger** | What starts an automation: `schedule` (cron, RRULE or a one-time date, with time zone), `event` (a filter over domain events), `webhook`, or `manual`. |
| **Automation** | A trigger, optional conditions, and an action (run agent, run task, run processor, notify, call webhook), plus a concurrency policy. |
| **Attention item** | Something that needs a human: a pending approval, review of AI output, a failure, triage of a new capture, an overdue task, or a question from an agent. The Inbox is a view over attention items. |
| **Notification** | A message to a principal with severity, source and actions. It is routed to targets by policy, and each attempt is a Delivery record. |
| **Surface connection** | A configured channel instance, such as a Telegram bot or Slack workspace. It has **identity links** (external user → principal) and **channel threads** (external chat/thread → Thread). |
| **Model provider / Model / Role** | Inference endpoints, the models they serve and those models' capabilities, and the routing of logical roles to models. Roles: `chat`, `background`, `vision`, `embedding`, `rerank`, `stt`, `tts`, `realtime`. |
| **Extension** | A package that contributes any of the above through a manifest. |

### 3.2 Item core schema

**[DATA-1]** Every item MUST have:

| Field | Requirement |
|---|---|
| `id` | Time-sortable and client-generatable (UUIDv7 or ULID) |
| `space_id` | Required |
| `kind` | Required |
| `title` | Optional |
| `summary` | Optional |
| `body` | Optional rich text or markdown, for kinds that have authored content |
| `props` | JSON validated against the kind's schema |
| `source` | `{type: upload \| url \| channel \| source \| agent \| api, ref, captured_by, user_agent}` |
| `storage_mode` | `managed` (Eclaire owns the original blob), `mirrored` (Eclaire keeps a synced copy of an external original) or `linked` (the original stays external; Eclaire keeps the origin, derived artifacts and an optional cache) |
| `origin` | Required when `storage_mode` is not `managed` (see Origin, §3.1) |
| `created_at`, `updated_at`, `captured_at` | Required |
| `content_at` | Optional "when it happened" time, e.g. EXIF date taken or an article's publish date |
| `rev` | A monotonically increasing revision |
| `deleted_at` | A tombstone |
| `processing_state` | Derived (§4.4) |

Facet fields (`pinned`, `flag`, `due_at`, `archived` and so on) are stored once per item, not per kind.

**[DATA-2]** Kind-specific fields MUST live in `props` (or a kind extension table generated from the schema) and be validated on every write. Core MUST stay unchanged when a kind is added.

**[DATA-3]** Universal facets available to every kind: `tags`, `pinned`, `flag` (colour enum), `archived`, `due_at` (opt-in via `schedulable`), `comments`, `links` and `attention`. Filtering, sorting and counting by any universal facet MUST happen in the database or search engine, never after fetching.

**[DATA-4]** There MUST be no per-kind duplication of lifecycle logic: create, update, delete, restore, history, tags, search, sync and permissions.

---

## 4. Data plane requirements

### 4.1 Kinds and the kind registry

- **[KIND-1]** A kind is declared by a manifest (Appendix B.1), which includes:
  - id and version
  - props schema (JSON Schema or Zod-equivalent)
  - facets
  - capture matchers (MIME types, file extensions, URL patterns, with priority)
  - the default processor plan
  - text-extraction mapping (which fields and artifacts feed search)
  - display metadata (icon, label, list/tile/detail templates, sort and filter fields)
  - tool exposure options
  - sync policy (eager or lazy blobs)
- **[KIND-2]** The registry MUST be the only source for kind lists. The API, OpenAPI, MCP tools, the frontend, purge, stats, export and search derive their behaviour from it. A hard-coded list of kinds outside the registry is a lint failure.
- **[KIND-3]** Built-in kinds:
  - v0.x parity: `note`, `bookmark`, `document`, `image`, `media` (audio and video) and `task`
  - Needed for Sources (§4.9): `file` (a generic file that matches no richer kind), `email` (message and thread), `event` (calendar) and `contact`; P1 for these four

  All of them MUST be implemented as extensions using the public API. Sources map external records onto these kinds wherever possible, so linked data gets the same UI, search and tools. Examples: Apple Reminders → `task`, Apple Notes → `note`, Photos → `image`/`media`, Drive files → `document`/`image`/`file`.
- **[KIND-3a]** Adding a kind MUST NOT require a new release of the native apps. Kinds describe their list, tile and detail presentation with **declarative view descriptors** (§6.1, [UI-1]). Every client renders these natively: SwiftUI on Apple platforms, React on the web. A kind gets custom native UI only by shipping an optional bespoke renderer.
- **[KIND-4] (P1)** Users MAY define **custom fields** on existing kinds and **custom kinds** through the UI, with no code. These are schema-only kinds with generic UI.
- **[KIND-5]** Changing a kind's schema MUST be versioned, with a declared migration (pure data transform) or a compatibility rule.

### 4.2 Capture and ingestion

- **[CAP-1]** One capture endpoint accepts files (multipart and resumable uploads), URLs, text and structured payloads. A classifier driven by kind capture matchers picks the kind, and an explicit kind override is allowed. The response is the created item, returned within 300 ms p95 (not counting upload time); processing continues asynchronously.
- **[CAP-2]** Resumable, chunked upload (tus or equivalent) for large files. Folder upload. Clipboard paste. Drag-and-drop anywhere in the web app.
- **[CAP-3]** Deduplication:
  - Blobs are deduplicated by content hash within a space.
  - URLs are deduplicated by normalised URL.
  - In both cases the policy MUST be configurable: `link_to_existing` (default), `create_duplicate` or `ask`.
- **[CAP-4]** Every capture surface uses the same ingestion pipeline and records `source`. Surfaces: web, PWA share target, mobile share sheet, desktop hotkey, CLI, email-in (P1), chat channels, Sources (§4.9), native app share extensions and Shortcuts, API and MCP.
- **[CAP-5]** A capture policy MAY set, per source or per space, whether new items land in **triage** (attention: "new capture to review") or are accepted automatically. This replaces v0.x's per-item "pending review".
- **[CAP-6]** Captures can be quick-annotated at capture time: a note, tags, a collection, and "ask the agent to do X with this".

### 4.3 Blobs and artifacts

- **[BLOB-1]** A BlobStore interface with conformance tests. Required implementations are local filesystem and S3-compatible (complete, including multipart and presigned URLs). Blobs are immutable and addressed by content.
- **[BLOB-2]** Blob reads honour HTTP range requests (for media streaming), ETags and content-disposition. Serving goes through the policy engine. Short-lived signed URLs are allowed for direct object-store reads.
- **[BLOB-3]** Reference counting or mark-and-sweep GC MUST remove blobs that no item or artifact references, after a grace period. Writing a blob and writing its database record MUST be crash-consistent: write the blob first, commit the reference, and let GC reclaim orphans.
- **[BLOB-4]** Optional encryption at rest for blobs and sensitive item fields, with per-space keys wrapped by an instance KEK. Key rotation must be supported.
- **[ART-1]** Every derived output is an Artifact record. Fields:
  - `item_id`
  - `kind` (namespaced, e.g. `text.markdown`, `rendition.pdf`, `image.thumbnail@800`, `transcript`, `exif`, `ocr`, `extraction.recipe`, `embedding.v1`)
  - `blob_ref` or `inline_value`
  - `mime`
  - `size`
  - `producer`: processor id and version, model id, prompt hash, and config hash
  - `input_hashes`
  - `status`
  - `created_at`

  Artifacts MAY derive from other artifacts.
- **[ART-2]** Artifact kinds are registered with a schema, so a client or agent can discover "which renditions does this item have?" through a generic endpoint. There MUST NOT be per-kind URL routes like `/thumbnail` hard-coded per type.
- **[ART-3]** Well-known artifact kinds give the UI and search a stable contract:
  - `text.plain` and `text.markdown`: the canonical text for search and agents
  - `image.thumbnail`
  - `image.preview`
  - `rendition.pdf`
  - `snapshot.screenshot` (with variants)
  - `snapshot.readable_html`
  - `transcript` (with timestamps)
  - `metadata.*`
  - `ocr`
  - `embedding.*`

### 4.4 Processing

- **[PROC-1]** A Processor is registered by manifest (Appendix B.2) and declares:
  - `accepts`: a predicate over kind, MIME type, URL pattern and the presence or absence of artifacts
  - `requires`: capabilities such as `llm.vision`, `llm.text`, `stt`, `browser`, `office`, `ffmpeg`, `network.egress`, `gpu`, and a resource pool
  - `produces`: artifact kinds and suggestion fields
  - `config_schema`
  - `version`
  - `cost_class`
  - `privacy_class`: `local-only` or `may-egress`
  - `timeout`
  - `retry_policy`
- **[PROC-2]** For each item the engine computes a **pipeline plan**, a DAG ordered by artifact dependencies, from the registry plus space and user policy (enable/disable processors, choose model per role, per-collection overrides). The plan is inspectable through the API and UI.
- **[PROC-3]** Processing is a **reconciliation**: desired artifacts (from the plan) are compared with existing artifacts (by producer version and input hashes), and only missing or stale nodes run. Consequences:
  - Re-running one processor, or everything downstream of it, is a first-class operation.
  - A new processor version or model choice can be backfilled selectively.
  - Editing an item re-runs only the processors whose inputs changed. This includes re-tagging a note after it is edited.
- **[PROC-4]** Each processor execution is a durable Run with attempts, start and end times, logs (stored, not just emitted), model and token usage, and errors. History is kept per attempt. It MUST NOT be overwritten by upserting one row per item.
- **[PROC-5]** Error semantics:
  - `permanent`: fail, no retry
  - `retryable`: retry with backoff
  - `deferred`: reschedule without consuming an attempt; used for rate limits
  - `degraded`: succeed with partial output and a warning

  Item `processing_state` is derived (none, pending, waiting_for_model, running, partial, failed, done) and changes only on terminal Run states, never on retryable errors or intermediate stages.
- **[PROC-6]** Processors can run conditional branches: a processor's output can enable downstream processors. Example: image classification enables OCR or document analysis. This is expressed declaratively in `accepts` predicates over artifacts.
- **[PROC-7]** Tiered fallbacks are a declarative pattern: an ordered set of alternative processors for the same artifact kind, where the first that succeeds wins. Examples:
  - Lightweight fetch before the headless browser
  - Docling before native extractors
  - Captions before embedded subtitles before STT
- **[PROC-8] Merge policy.** Processor output lands in artifacts. Values proposed for item fields (title, summary, tags, `content_at`, location) become **Suggestions**.
  - A per-space policy decides auto-accept, the default for fields the user has never touched.
  - User-set values are locked by default and never overwritten.
  - AI tags are added with `source=ai` and MUST NOT remove user tags.
- **[PROC-9]** Resource pools with configurable concurrency, for example `llm.local`, `browser`, `office`, `stt` and `gpu`. Per-provider and per-domain rate limits are stored durably, so they apply consistently across processes.
- **[PROC-10]** Sandboxing. Processors that handle untrusted input with native tools (office conversion, image codecs, headless browsers, downloaders) MUST run out of process with:
  - CPU, memory and time limits
  - a read-only filesystem except a scratch directory
  - network access denied, unless declared and allowed by policy

  Fetchers MUST enforce SSRF protection: block private, loopback and link-local ranges and metadata endpoints, re-check after redirects and DNS resolution, and allow a configurable allowlist.
- **[PROC-11]** Processors MAY run in separate **processor runtimes** such as container images or language sidecars (a Python Docling or whisper service) through a documented processor protocol (Appendix B.2). The core image MUST NOT need heavy native dependencies. Office, browser, media and document-AI support ship as optional processor packs or images.
- **[PROC-11a] macOS native processor pack.** On macOS a Swift helper provides processors backed by system frameworks, with no extra install:

  | Framework | Used for |
  |---|---|
  | Vision | OCR, image classification, document segmentation |
  | ImageIO | HEIC and RAW decoding |
  | PDFKit, QuickLook | Renditions and thumbnails of most formats, including iWork |
  | AVFoundation | Media metadata, waveforms, thumbnails |
  | Speech | On-device STT |
  | Foundation Models | Small on-device LLM tasks: tagging, titles, summaries |

  The same processor protocol makes these interchangeable with Linux packs. The planner prefers the best available implementation of each artifact kind (via `fallbackGroup`).
- **[PROC-12]** Prompts used by AI processors are versioned assets. Their hash is part of artifact provenance. Admins MAY override them, which bumps the effective version.
- **[PROC-13]** Built-in processor coverage at v1 (parity with v0.x):

  | Area | Coverage |
  |---|---|
  | Web | Fetch, readable extraction, screenshots (desktop, mobile, full page), PDF snapshot, favicon, metadata and JSON-LD, site handlers for GitHub (repo info, README), Reddit and X |
  | Documents | Docling (or equivalent) structured extraction with OCR; native extractors for txt, md, csv, json, xml, rtf and html; Office and iWork conversion; PDF rendition; thumbnails |
  | Images | Format normalisation (HEIC, AVIF, TIFF and others), thumbnails, EXIF, reverse geocoding (local or offline-capable provider), vision classification, OCR, visual description, dominant colours |
  | Media | URL import (yt-dlp-class), metadata, waveform, video thumbnail, captions → subtitles → STT transcript with timestamps |
  | All kinds | Title, summary and tag suggestions; chunking; embeddings |

### 4.5 Search and retrieval

- **[SRCH-1]** **Hybrid search**: lexical (BM25-class, with stemming per detected language and fuzzy and prefix matching) plus semantic (vectors over chunks), fused (e.g. RRF) with optional reranking. When there is no embedding model, lexical search alone MUST work fully.
- **[SRCH-2]** A query is a text component plus a structured filter AST over core fields, facets, props (for fields marked filterable in the kind schema), tags, collections, links, source, dates, processing state and attention state. Filters, sorts, facet counts and pagination are executed by the engine.
- **[SRCH-3]** Results include highlighted snippets, matched-chunk references (artifact and offset) for citations, and a relevance score. Sorting options are relevance, any sortable field, and `content_at`.
- **[SRCH-4]** One query language serves the UI search box, smart collections, the agent `search` tool, MCP, the API and trigger filters. There is also a human syntax, such as `kind:bookmark tag:recipes due:<7d "olive oil"`.
- **[SRCH-5]** Search is behind a **SearchIndex** interface with a conformance suite. Indexing is driven from the event log, so it is eventually consistent. The default backend MUST give identical results semantics in every supported deployment mode. Silently degrading to `LIKE` is forbidden. Index lag is observable, and a full reindex is a standard admin operation.
- **[SRCH-6]** Retrieval for agents returns chunk-level results with item metadata and a token-budgeted excerpt, never whole items by default. "Read item" tools page through long content.
- **[SRCH-7]** Search is permission-aware: results are filtered by the caller's grants inside the engine query, not afterwards.
- **[SRCH-8]** Performance targets on reference hardware: a 2023 laptop or 4-core NAS-class machine, with 100k items and 2M chunks.
  - Lexical query: p95 under 150 ms
  - Hybrid query: p95 under 400 ms, not counting the reranker
  - Index freshness: p95 under 5 s after the processor completes

### 4.6 Organization and attention

- **[ORG-1]** Tags are a flat, case-insensitive namespace per space. A tag MAY have a colour and description, and hierarchical tags (`a/b`) are P1. Rename and merge operations update all items atomically.
- **[ORG-2]** Collections come in two types:
  - **Manual**: ordered membership.
  - **Smart**: a saved query (§4.5).

  Both can be used as permission scopes for grants, sync scopes and automation filters.
- **[ORG-3]** Links are typed edges with a backlinks view. Mentions of `eclaire://item/<id>` or `[[...]]` in item bodies and agent responses create `references` links automatically.
- **[ORG-4]** Comments can be added to any item. Comments by agents are attributed to the agent principal.
- **[ORG-5]** **Attention model.** Attention items are records with a type, subject (item, run, approval or task), reason, severity, assignee principal, created time, and resolution (resolved_by, resolved_at, outcome). Types:
  - `approval`
  - `review` (AI output or task result)
  - `triage` (new capture)
  - `failure`
  - `due` and `overdue`
  - `question` (an agent asking the user)
  - `mention`

  The Inbox is a view over these, with sections, counts and bulk actions. Resolving an attention item from any surface resolves it everywhere.
- **[ORG-6]** Built-in smart views: All, Inbox, Due soon, Overdue, Pinned, Flagged, Recently added, Recently viewed (P1), By kind, By tag, By collection. Users can save their own views, which are smart collections with display preferences.

### 4.7 History, audit, deletion and retention

- **[HIST-1]** The **Change log** stores field-level diffs per item, with actor principal, grant, cause (user edit, run id, processor id, source, sync), and time. It powers per-item history, undo (P1), the activity feed and the sync feed.
- **[HIST-2]** The **Audit log** is separate and append-only. It covers authentication, credential lifecycle, grant changes, admin actions, egress events (calls to non-local providers, with byte counts), and policy denials. It does not store item content. Admins can export it.
- **[HIST-3]** Agent prompts and transcripts live in Threads and Runs (§5.3), not in history.
- **[HIST-4]** Deletion is soft by default and goes to Trash with configurable retention (default 30 days), then hard delete. Hard delete removes item content from the change log (keeping metadata stubs), drops index entries, artifacts and orphaned blobs, and emits a tombstone to sync. "Delete all my data" and "delete my account" MUST be complete, using the kind registry, and verified by a test that checks no rows or blobs remain.
- **[HIST-5] (P1)** Retention policies per kind, collection or source, for example "auto-archive bookmarks after 1 year" or "delete raw HTML snapshots after 90 days".

### 4.8 Sync and offline

- **[SYNC-1]** A per-space **change feed** with a monotonically increasing sequence. `GET /sync/changes?since=<seq>&scope=<scope>` plus a live subscription. Every item, facet, tag, collection, link, comment and attention change, and every tombstone, appears in the feed. The feed is permission-filtered per principal.
- **[SYNC-2]** Clients maintain a local replica scoped by a **sync scope**, which can be whole space metadata, specific collections, or the last N days. Blob sync policy: metadata and text are eager; thumbnails are eager; originals and renditions are on demand or "make available offline".
- **[SYNC-3]** Offline writes go to a durable client queue. They use client-generated ids, include the base `rev`, and are idempotent. Conflicts are resolved per field with last-writer-wins by server order, and the losing value is kept in the change log. Rich-text merge (CRDT) for note bodies is P2.
- **[SYNC-4]** Offline search works over the local replica's metadata and text. Hybrid semantic search offline is P2, optional, and needs an on-device embedding model.
- **[SYNC-5]** Optimistic concurrency on the API: `If-Match: <rev>` on updates, `409` on conflict, with the current state returned.
- **[SYNC-6]** The same sync protocol serves the web/PWA, desktop and mobile clients, and is documented for third-party clients.

### 4.9 Sources: import, mirror and link

v0.x could only *copy data in*. The rebuild treats external systems as **Sources** that Eclaire can import from once, mirror continuously, or **link to in place**. In link mode the original stays where it is; Eclaire indexes it, enriches it, organises it, and with permission acts on it.

- **[SRC-1]** A Source is defined by a Source extension (Appendix B.6). It declares:
  - **Auth**: OAuth 2 with a **user-supplied client** (Eclaire ships no shared, verified OAuth client; see §12), token, OS permission (e.g. Photos, Full Disk Access), or none
  - **Host requirement**: `server`, `macos`, `ios` or `any_edge`
  - **Supported modes**: `import`, `mirror`, `link`
  - **Change detection**: push, webhook, a change-cursor API, an OS event stream, or polling
  - **Kind mapping**
  - **Dedup keys**
  - **Rate limits**
  - **Actions** it can perform on the external system (see [SRC-6])
- **[SRC-2] Modes.** Each Source instance is configured with a mode.

  | Mode | Behaviour |
  |---|---|
  | `import` | One-time copy into managed items. The source can be disconnected afterwards. |
  | `mirror` | Continuous sync into managed copies. Eclaire keeps the bytes. External deletes follow a configurable policy: tombstone, keep, or ask. |
  | `link` | Eclaire stores the origin, metadata, derived artifacts (text, thumbnails, OCR, transcripts, embeddings) and an optional **cache**. The original is fetched on demand from its host. |

  Link mode has a cache policy: `none`, `derived_only` (the default: text plus thumbnails), `recent` (e.g. LRU up to N GB) or `full`.
- **[SRC-3] Scope rules.** Each Source has include and exclude rules: paths and globs, labels and folders, albums, accounts, date ranges, file types, and maximum size. It is assigned to a target **space**, with optional default collections and tags. Defaults exclude obviously sensitive locations: keychains, `.ssh`, browser profiles, password-manager exports. Exclusions are always visible to the user.
- **[SRC-4] Continuous change tracking.** Sources track additions, edits, moves, renames and deletions in near real time where the platform allows. Examples:
  - FSEvents with file-system bookmarks or file IDs on macOS, so a rename or move keeps item identity
  - inotify or polling on Linux
  - PhotoKit change observers
  - EventKit notifications
  - Gmail `history` plus push notifications
  - The Drive changes API

  Item identity survives renames and moves through `external_id`. Content changes bump the origin version and trigger processor reconciliation for affected artifacts only ([PROC-3]).
- **[SRC-5] Availability.** A linked item whose host is offline stays fully searchable, and its derived artifacts and cache remain viewable. Opening the original shows "available when <host> is online" plus any cached rendition. When the source reports a deletion, the item becomes `missing`, which is a visible state. After a configurable grace period it is tombstoned. Eclaire annotations (tags, comments, links) are kept until the item is purged.
- **[SRC-6] Acting on sources (write-back).** Sources expose **actions** as tools, with effect `external` or `destructive`, gated by the approval policy (§5.5). Examples:

  | Source | Actions |
  |---|---|
  | Files | Move, rename, create folder, set Finder tags, trash |
  | Photos | Add to album, favorite, set keywords where the platform allows |
  | Mail | Label, archive, mark read, create draft, send (always `ask` by default) |
  | Reminders | Create, complete, edit |
  | Notes | Create, append (where possible) |

  Large operations ("sort my Downloads folder") MUST go through a **plan → preview → approve → execute → undo** flow:
  - The agent produces a change plan: a list of actions with before and after values.
  - The UI shows it as a diff.
  - Execution is journaled, and the journal supports one-click undo for reversible actions.
  - Partial failures are reported per action.
- **[SRC-7] Annotation overlay and write-through.** Eclaire-side metadata (tags, collections, comments, suggestions) is stored in Eclaire. Optionally, per source, tags can be **written through** to native equivalents: Finder tags, Gmail labels, Photos keywords. This is configurable and conflict-aware: the external value wins unless the user chooses otherwise.
- **[SRC-8] Privacy and credentials.**
  - Source credentials and OS permissions stay on the host that runs the Source. Edge-hosted credentials are kept in the device Keychain and never uploaded.
  - Processing of linked content follows the space's egress policy. "Index my mail with local models only" MUST be enforceable.
  - Users can disconnect a Source and choose to keep or purge everything derived from it.
- **[SRC-9]** Source syncs are durable Runs, with status, last sync, item counts and errors shown in the UI. Failures and permission problems become attention items, e.g. "Photos access revoked on Alice's MacBook".
- **[SRC-10] Extensibility.** A new Source is one extension package that implements the B.6 contract and passes the Source conformance kit, which provides a fake external system covering change events, renames, deletes, rate limits and auth expiry. Core MUST NOT need changes to add a Source.
- **[SRC-11] Initial catalogue.** The design must make all of these straightforward. Delivery is phased (§11).

  | Source | Host | Modes | Notes |
  |---|---|---|---|
  | Local folders | **Server** (folders on the machine running Eclaire: a Mac in local mode, or a NAS); macOS app and `eclaire-edge` for other machines (P2) | link, mirror, import | Spotlight metadata importer optional; write-back: move, rename, Finder tags |
  | Apple Photos | macOS app; iOS app (P2) (PhotoKit) | link, import | iCloud originals downloaded on demand; albums and favorites write-back |
  | Apple Reminders | macOS app; iOS app (P2) (EventKit) | link (two-way) | Maps to `task`; robust public API |
  | Apple Calendar, Contacts | macOS app; iOS app (P2) (EventKit, Contacts) | link | Maps to `event` and `contact` (P1) |
  | Apple Notes | macOS app | **import, mirror, link; read-only** (decided) | **No public API.** Read via AppleScript/JXA or the Notes database (needs Full Disk Access; undocumented format that can break between OS releases). Version-pinned parsers, a CI canary on each macOS beta, and an "experimental" label. No write-back. Not possible on iOS. |
  | Gmail, Google Drive, Calendar, Contacts | Server | link, mirror, import | Google Workspace APIs. **Decided:** each instance uses its **own Google Cloud OAuth client**, created through a guided setup with screenshots, required scopes and a test-user list. Eclaire is not verified by Google at this stage. IMAP or JMAP with app passwords is the low-friction fallback for mail. |
  | IMAP / JMAP mail | Server | link, mirror | Generic fallback for any mail provider |
  | Microsoft 365 (Graph) | Server | link, mirror | P2 |
  | X bookmarks, GitHub stars, Reddit saved, RSS | Server | mirror, import | X is scheduled (v0.x only had manual sync); the others are P1 |
  | Browser bookmark export, Google Takeout, Apple exports | Server | import | P1 / P2 |
  | Email-in address | Server | import | P1 |

### 4.10 Export, portability and backup

- **[PORT-1]** Full export of a space to an open, documented archive: JSON Lines for items, tags, collections, links, comments, threads and messages, plus a blob directory and a manifest with checksums. Import of the same format, with id preservation or remapping. Export is available through the UI, CLI and API.
- **[PORT-2]** Instance backup and restore is built in. It is consistent across the DB and blobs, can be scheduled, and keeps N backups. A backup is taken automatically before every migration.

### 4.11 Spaces, collections and scoped access

There are three levels of organisation, each with a distinct job:

| Unit | Purpose | Cardinality | Example |
|---|---|---|---|
| **Space** | Hard boundary: isolation, policy and sharing | Each item is in exactly one space | Personal, Work, Family |
| **Collection** | Soft grouping: folders and lists, manual or smart, nestable | An item can be in many | Work › Clients › Acme; "Tax 2026"; smart "Unread articles" |
| **Tag** | Lightweight labels | Many | `receipt`, `to-read` |

- **[SPACE-1]** A user can create and switch between multiple spaces. Every client has a space switcher, plus an optional "All my spaces" view that searches and lists across spaces the user can read. Results are labelled with their space.
- **[SPACE-2]** Each space has its own settings, which override instance defaults:
  - Egress policy (e.g. Work: local models only)
  - Model role assignments
  - Enabled processors and kinds
  - Default agents
  - Retention
  - Capture defaults
  - Optional encryption-at-rest key
  - Sources that feed it
- **[SPACE-3]** Moving an item between spaces is an explicit action. Its collections, links and comments are re-validated, and history records the move. Links across spaces are allowed; each side's visibility is enforced separately.
- **[SPACE-4]** Capture routing rules choose the target space. Examples: "files from the Work folder → Work", "email to my work account → Work", "Telegram bot X → Personal". Capture surfaces also allow an explicit space choice, and the share sheet remembers the last one used.
- **[SPACE-5] Scoped grants.** A grant to any principal (agent, API key, MCP client, edge host, channel identity link, another user) is a list of rules. Each rule specifies:
  - **Resources**: a space; optionally narrowed to collections (including their children), kinds, tags, a saved query, specific items, or a source
  - **Actions**: any combination of `read`, `create`, `update`, `delete`, `comment`, `act_on_source` (write-back), `share`
  - **Constraints**: expiry, allowed surfaces, and "approval required for writes"

  The effective permission is the intersection with the granting principal's own permissions ([AUTHZ-3]). Examples:
  - *Research agent:* read-write on `Personal › Research`, read-only on the rest of Personal, nothing in Work.
  - *Work agent:* read-write on the Work space, local models only (inherited from Work's egress policy).
  - *Claude Code MCP key:* read-only on the `Work › Projects › Atlas` collection, expires in 30 days.
  - *Family member:* comment-only on the `Family › Recipes` collection.
- **[SPACE-6]** Grants on smart collections are dynamic: items that start matching the query become visible, and items that stop matching become hidden. The UI MUST make this clear when such a grant is created.
- **[SPACE-7]** Every surface lists a principal's effective access in plain language ("This agent can read 1,240 items in Personal › Research and edit them"). Users can audit what any agent or key has accessed (from the audit log, [HIST-2]).

### 4.12 Edge hosts

- **[EDGE-1]** An edge host is a device paired with the instance as a `device` principal. Pairing uses a QR code or code exchange, and the device holds its key in the Keychain or Secure Enclave. Edge hosts:
  - Run **Sources** that must live on the device (local files, Photos, Reminders, Notes)
  - Run **local processors** (§4.4), such as Apple Vision OCR, on-device speech, or the Foundation Models LLM
  - Serve **on-demand originals** for linked items
  - Keep an offline replica (§4.8)
- **[EDGE-2]** Edge hosts talk to the instance over the public API, the sync protocol and the processor protocol. They have no special back channel. A device's grant limits what it can read and write. A Mac that only hosts the Photos source does not need to read Work.
- **[EDGE-3]** On-demand originals. When a client opens a linked item, the instance asks the owning edge host to stream the original through a relayed, authenticated, time-limited channel. Direct peer-to-peer on a LAN is P2. Large originals are streamed, never buffered in full.
- **[EDGE-4]** Edge hosts are resource-aware. They back off on battery or low-power mode and on metered networks, respect iOS background-execution limits (BGProcessingTask, Photos change history), and let the user pause indexing.
- **[EDGE-5]** In single-user local mode (§7.9, [DEP-7]) the server itself reads local folders directly. Once the macOS app ships, it is both the instance and an edge host, with no network hop.

---

## 5. Agent plane requirements

### 5.1 Models, providers and routing

- **[MODEL-1]** Provider adapters are extensions (Appendix B.8). Required at v1:
  - OpenAI-compatible Chat Completions, which covers llama.cpp, vLLM, Ollama, LM Studio, MLX servers and OpenRouter
  - The OpenAI Responses API
  - The Anthropic Messages API
  - Google Gemini (P1)
- **[MODEL-2]** Adapters MUST preserve provider-native features rather than reduce everything to the lowest common denominator:
  - Reasoning and thinking blocks, including signatures where required
  - Prompt caching
  - Image, audio and file input
  - Structured output and JSON schema
  - Parallel tool calls
  - Citations
  - Usage and cost reporting

  The internal representation is a provider-neutral message and part model (§5.3), not one provider's wire format.
- **[MODEL-3]** The model registry stores, for each model:
  - Capabilities: modalities in and out, tool calling, structured output, reasoning mode, context window, max output
  - Tokenizer
  - Pricing
  - Locality: `local` or `remote`
  - Data policy
  - For local GGUF models (optional): memory estimate

  The registry can be imported from Hugging Face, OpenRouter or provider listing APIs. Calls are validated against capabilities before dispatch.
- **[MODEL-4]** Logical **roles** route to models with ordered fallbacks: `chat`, `background`, `vision`, `ocr`, `embedding`, `rerank`, `stt`, `tts`, `realtime_voice`, `summarize`. Overrides can be set per space, per agent and per processor.
- **[MODEL-5] Egress policy.**
  - Every provider is classified `local` or `remote`, with a data-handling note.
  - Space policy MAY forbid remote providers globally, per kind or collection (for example "health" or "finance"), or per role.
  - The router MUST enforce the policy at call time. A violation fails closed and creates an audit event.
- **[MODEL-6]** Generation parameters (max output tokens, temperature, reasoning effort) are set per agent or per processor, with defaults that respect model capabilities. Nothing is hard-coded.
- **[MODEL-7]** An LLM call ledger records role, model, provider, caller (run or processor), tokens in and out, cached tokens, latency, cost, and egress class. Prompt and response bodies are stored only when debug tracing is enabled for that scope.

### 5.1a Local inference out of the box

The goal: someone who has never heard of llama.cpp or GGUF gets a working, private, local assistant from the setup wizard alone.

- **[MODEL-8] Managed local engine (P0 on macOS and Linux).**
  - Eclaire installs and supervises a proven local inference engine (D19) as a managed process: start, stop, health checks, restart on failure, and logs in the admin UI.
  - The engine binds to localhost or a socket and is reachable only by Eclaire.
  - It serves several models at once and loads and unloads them on demand within a memory budget.
  - The engine is an implementation of the provider contract (Appendix B.8). Nothing else in the system knows whether a model is managed or external.
- **[MODEL-9] Model manager.** Models are downloaded from Hugging Face (or a mirror) with:
  - progress, ETA, pause/resume and checksum verification
  - disk-space checks before starting
  - storage in the Eclaire data directory, or reuse of an existing cache
  - removal and updates from the UI and CLI

  Gated or licence-restricted models show their licence and need explicit acceptance. Downloads are durable runs ([JOB-1]), so they survive restarts.
- **[MODEL-10] Hardware-aware recommendations.**
  - Setup probes the hardware: chip/GPU, unified memory or VRAM, free disk, OS version, and whether Apple on-device models are available.
  - It then proposes **one recommended bundle** covering each role (chat with tool calling, vision, embedding, optionally STT/TTS), sized to fit with headroom using the memory check in RULE-AI-6.
  - It prefers **one multimodal model** for chat and vision where quality allows.
  - Alternatives are offered as "Lighter" and "Higher quality". The user sees the total download size and expected memory use before confirming.
  - Recommendations come from a **curated, versioned catalogue**: a data file shipped with each release, optionally refreshed from the project's GitHub. Nothing about models is hard-coded. The catalogue is maintained using the eval suite ([QA-6]) on reference hardware tiers (e.g. 16 GB, 32 GB and 64 GB+ Apple Silicon; the M4 Max 64 GB is the primary reference).
- **[MODEL-11] Reuse what is already there.**
  - Setup detects running inference servers (Ollama, LM Studio, llama.cpp, MLX servers, vLLM) and model files already on disk (Hugging Face, Ollama and LM Studio caches).
  - It offers to use them instead of downloading duplicates.
  - It finds inference servers elsewhere on the LAN or tailnet, either through explicit discovery (mDNS) or by the user entering a URL. This is the normal path for Linux and NAS installs without a GPU, which would use a Mac or GPU box on the network.
- **[MODEL-12] Progressive capability (no dead ends).**
  - With no model at all, Eclaire is fully usable for capture, organisation, keyword search, previews, and platform-native OCR and STT.
  - AI-dependent processor steps wait in the state `waiting_for_model` rather than failing. When a model for that role becomes available, reconciliation runs them automatically ([PROC-3]).
  - Features that need a missing role are shown with a clear "enable" path. They are never broken or silently absent.
  - Upgrading from a smaller to a larger model later back-fills only the artifacts the user chooses.
- **[MODEL-13] Instant-start tier.** Where platform on-device models are available (e.g. Apple's Foundation Models framework on supported Macs), they are registered as a local provider that covers the `background` role (tags, titles, summaries) and a basic `chat` role from the first minute, with no download. Their limits (context size, tool-calling quality) are recorded in the model registry, so routing prefers the full local model once it is installed.
- **[MODEL-14] Optional cloud preset.**
  - Setup offers "Use a cloud provider" as an explicit, non-default choice: paste an API key for OpenRouter, Anthropic, OpenAI or another provider.
  - Remote providers are subject to the egress policy ([MODEL-5]). The UI shows which spaces and roles may use them, and the defaults keep any space marked local-only unaffected.
  - Mixed setups are first-class. Examples: local embeddings plus cloud chat; cloud chat allowed for Personal while Work stays local-only.
- **[MODEL-15] Resource coexistence.**
  - The engine schedules work by priority: interactive chat, then voice, then background processing, then embedding backfill. Lower-priority work yields when interactive requests arrive ([PROC-9]).
  - The user can cap the total memory Eclaire's models may use, and pause background AI work, from the UI or a menu-bar or CLI toggle.

### 5.2 Agents

- **[AGENT-1]** An agent definition includes:
  - Name, handle and avatar
  - Instructions
  - Model policy (role or explicit model, parameters)
  - **Toolsets**
  - Skills
  - **Data grants** (which spaces, kinds and collections it can read or write)
  - Approval policy (§5.5)
  - Memory policy (§5.6)
  - Budgets: max steps, tokens, cost and wall time per run
  - Allowed surfaces
- **[AGENT-2]** Each agent is a Principal. Its effective permissions are the **intersection** of the agent's grants and the invoking principal's permissions. An agent invoked by a read-only API key can never write. An agent limited to the "recipes" collection never sees anything else, in either search or tools.
- **[AGENT-3]** A default general assistant agent ships, plus templates. Agents can be versioned, and a run records the agent version it used.
- **[AGENT-4] (P1)** Sub-agents and delegation. An agent MAY call another agent as a tool, with its own grants and budget. The sub-run is linked to the parent run.

### 5.3 Threads, runs and transcripts

- **[RUN-1]** A **Thread** is surface-independent. The same thread can be continued from web, CLI, Telegram or voice. Threads have participants (principals), a title (auto-generated), and pinned context items. They support archive, delete and search.
- **[RUN-2]** **Messages** are ordered lists of typed parts. Part types:
  - `text`
  - `reasoning` (with provider signature metadata)
  - `tool_call`
  - `tool_result` (structured, with optional files or images)
  - `file`
  - `citation` (pointing to an item, artifact or chunk)
  - `approval_request`
  - `approval_response`
  - `notice`

  The transcript is **canonical and complete**: it can be replayed to the model as-is, and every tool result is stored, with large ones stored as artifacts and referenced.
- **[RUN-3]** An **Agent Run** is a durable state machine:

  ```
  queued → running → (awaiting_approval | awaiting_input) → running → succeeded | failed | cancelled | timed_out
  ```

  - Run state, step outputs, and pending tool calls are persisted after every step.
  - After a process crash, a run resumes from its last committed step, or is marked failed with a clear reason, as the run policy decides.
  - Runs execute on workers and are decoupled from any client connection.
- **[RUN-4]** **Cancellation is real.** Cancelling a run propagates an abort signal to the model call and to running tools. Late results after cancellation are discarded and not persisted as successful.
- **[RUN-5]** **Resumable streams.** Clients subscribe to a run's event stream with a cursor. Any client on any device can attach to an in-progress run and receive the events it missed, then live events.
- **[RUN-6] Context management.**
  - The context builder assembles, within a token budget derived from the model's context window: system instructions, agent instructions, surface hints (§6.4.6), the user profile, pinned items (excerpted), relevant memory, recent messages (**newest first** within budget), and a running summary of older turns.
  - Compaction (summarising older turns into a stored summary part) happens automatically at a configurable threshold.
  - Attaching items to a message MUST NOT disable tools.
- **[RUN-7] Step trace.** Each step records the model call (ledger reference), reasoning, tool calls with input, output, duration, status and approval linkage, and token usage. The trace is viewable in the UI with progressive disclosure: summary, timeline, then full I/O.
- **[RUN-8]** Unread and needs-attention indicators per thread, and "agent activity" (running, failed, awaiting you) across all threads.

### 5.4 Tools and toolsets

- **[TOOL-1]** **One tool registry.** A tool is defined once (Appendix B.3) with:
  - Name and namespace
  - Description and prompt guidance
  - Input and output JSON Schemas
  - `effect`: `read`, `write`, `destructive` or `external` (sends data off-host or has side effects outside Eclaire)
  - Required permissions
  - Default approval policy
  - Result size policy (truncate, page or artifact)
  - Optional UI renderer hint
  - Availability conditions: surface, interactive versus background, required capabilities
- **[TOOL-2]** The same definitions are exposed to:
  - Eclaire's own agent runtime
  - The **MCP server** (§5.9)
  - The REST API (as RPC endpoints or through their underlying resources)
  - External harness adapters

  The permission and approval checks are identical in every path.
- **[TOOL-3]** **Generated data tools.** For every kind, the registry generates `search`, `get` (with paging of long content), `create`, `update` (props-schema-validated patch), `delete` (destructive) and `list_artifacts` / `read_artifact`. Kind-specific tools can be added. One generic set with `kind` as a parameter is preferred over N×6 copies; the generated schemas include each kind's props.
- **[TOOL-4]** Built-in toolsets at v1:
  - Data: the generated tools, plus tags, collections, links, comments and attention
  - Tasks and automations
  - Notifications
  - Web: fetch, readable, search. Pluggable search provider; egress-classified.
  - Browser automation (headless sandboxed; optionally attach to the user's Chrome for human-present sessions only)
  - Audio: transcribe and speak
  - Memory
  - Admin (admin principals only)
  - Skills: list and load
- **[TOOL-5]** MCP **client**. External MCP servers (stdio, streamable HTTP) can be registered per instance (admin) or per space (user, P1). Options per server: tool allow and block lists, name prefix, mode (individual tools or a grouped dispatcher), effect classification override, availability flags (`requires_human_present`, `disabled_in_background`, `requires_local`) enforced generically, auth (OAuth or headers), and health status. MCP resources and prompts are surfaced too (P1).
- **[TOOL-6]** Tool results can include images and files. These MUST be delivered to models that accept them.
- **[TOOL-7]** Tools that are slow report progress events to the run stream.

### 5.5 Approvals and policy

- **[APPR-1]** Approvals are decided by a **policy**, not hard-coded per tool. Rules are evaluated in order of specificity: instance, then space, then agent, then user, then tool. A rule matches on tool, effect, arguments (simple predicates such as `recipient in allowed_channels`), surface, and interactive versus background. It yields `allow`, `ask` or `deny`. Defaults:
  - `read`: allow
  - `write`: allow, but `ask` for agents running in background without an assist-mode review
  - `destructive`: ask
  - `external`: ask
- **[APPR-2]** An `ask` creates a persisted **Approval request** (an attention item). It can be resolved from **any surface**:
  - Inline in web chat
  - Native buttons in Telegram, Slack and Discord
  - A CLI prompt
  - Voice confirmation, for low-risk effects only, as configured
  - The Inbox
- **[APPR-3]** While a run waits for approval it is in `awaiting_approval`, which survives restarts. Requests have a configurable expiry. On expiry the tool call is denied with a reason the model can see.
- **[APPR-4]** "Approve always for this agent/tool/argument pattern" creates a policy rule, which can be revoked from settings.
- **[APPR-5]** Background runs (scheduled, event-triggered) follow the same policy. An `ask` there produces an approval request and pauses the run. It MUST NOT fail with "requires approval".

### 5.6 Context, retrieval and memory

- **[MEM-1]** Retrieval-augmented answers use hybrid search (§4.5) through tools. Answers that use retrieved content MUST include citations, as parts linking to items, artifacts or chunks, which the UI renders as previews.
- **[MEM-2]** **Memory** is explicit and user-visible. Memories are items of kind `memory` (fact, preference or instruction), with source (thread or message) and scope (space, agent). Agents propose memories under policy: auto-save, ask, or off. Users can view, edit, delete and search memories. Relevant memories are retrieved into context within a budget.
- **[MEM-3]** User profile context (name, time zone, locale, preferences) is structured data. It is not concatenated into a prompt from free-form fields.

### 5.7 Skills

- **[SKILL-1]** Skills follow the **SKILL.md** convention: frontmatter (name, description, tags, always_include), a markdown body, and optional bundled files and scripts. They are loaded with progressive disclosure (catalogue in context; body on demand).
- **[SKILL-2]** Skill sources: shipped by extensions, an instance skills directory, per-space user skills (uploaded or authored in the UI, P1), and optionally a user's `~/.agents/skills` in local mode. Agents enable skills by name or tag. Admin-only skills are enforced in every path.
- **[SKILL-3]** Skills MAY declare required tools. Enabling a skill whose required tool is unavailable shows a warning.

### 5.8 Tasks, triggers and automations

- **[TASK-1]** Task is a kind with the `workflow` facet. Fields:
  - `status`: `todo`, `in_progress`, `blocked`, `done` or `cancelled`
  - `assignee`: a principal, human or agent
  - `delegation_mode`:
    - `manual`: the assignee does the work
    - `assist`: the agent does it and a human reviews
    - `autonomous`: the agent does it and completes the task
  - `priority`
  - `due_at`
  - `review_state`: `none`, `pending`, `approved` or `changes_requested`
  - `instructions`: the prompt for agent assignees
  - `deliverables`: links to output items
  - `parent`: one level of **sub-tasks** via a parent link (P0). Sub-tasks are ordinary tasks, so they have their own assignee, status and runs. The parent shows progress (e.g. 2/5).
  - `checklist`: lightweight to-do items inside a task that are not tasks themselves (P0)
  - `project`: optional grouping, implemented as a collection with the task facet's views (P0)
  - Statuses per space, customisable within the fixed categories `backlog`, `todo`, `in_progress`, `done` and `cancelled` (P1)
- **[TASK-1a] Task UX reference.** Use Linear as the bar for a simple, clean, fast task system:
  - Keyboard-first creation and editing
  - Instant filters
  - **List and board views** of the same query, grouped by status, assignee, priority, project or due date (P0)
  - Sub-task rollups
  - Inline status and assignee changes
  - Little visual noise

  Agents are first-class assignees in every one of these views.
- **[TASK-2]** Assigning a task to an agent, or a trigger firing on a task, creates an **Agent Run** linked to the task. The run's output becomes a task comment and/or deliverable items.
  - In `assist` mode, completion creates a `review` attention item. "Request changes" with feedback starts a new run on the same thread.
  - In `autonomous` mode the task completes on success. A recurring task remains active for future occurrences.
- **[TASK-3]** **Triggers**, unified:
  - `schedule`: cron with time zone, RRULE, or a one-time date-time. Optional `start` and `end` and `max_occurrences`. Catch-up policy for missed runs: `skip`, `run_once` or `run_all`.
  - `event`: any domain event plus a filter in the §4.5 query language. Examples: "item created where kind=bookmark and source.url host=arxiv.org", "processing failed", "message received on channel X".
  - `webhook`: a signed inbound URL.
  - `manual`.
- **[TASK-4]** **Automations** connect a trigger, optional conditions, and an action. Actions: run agent (with prompt and context items), run task, run processor or reprocess, create item, notify, call outbound webhook.
  - Concurrency policy: `skip_if_running`, `queue` or `replace`.
  - Every firing is an **Occurrence**, recorded as a Run with status, output and delivery results.
- **[TASK-5]** Reminders are automations with a notify action. The overdue checker is a built-in system automation, not special-cased code.
- **[TASK-6]** The scheduler is durable and runs in any topology, with leader election or DB leases. A single trigger never fires twice for the same instant across processes.

### 5.9 Interop: bring your own harness, expose Eclaire agents

- **[INTEROP-0] Two first-class paths (decided).** The built-in agent runtime MUST work out of the box: no external harness to install, local models by default. Eclaire MUST also work smoothly with external harnesses, with **Claude Code and Pi as the launch targets** (Codex, OpenCode and Cursor follow). There are two directions:
  - **Bring the harness to Eclaire's data**: [INTEROP-1] and [INTEROP-1a], P0.
  - **Run Eclaire agents on an external harness**: [INTEROP-2], P1.
- **[INTEROP-1] MCP server (P0).** Eclaire exposes an MCP server over streamable HTTP and stdio (the stdio variant runs through the CLI). It provides:
  - **Tools**: the tool registry, filtered by the credential's grants and the approval policy
  - **Resources**: items and artifacts as `eclaire://` URIs, plus resource templates for search
  - **Prompts**: skills, P1

  Auth uses OAuth 2.1 (MCP authorization spec) and scoped API keys. Tool calls made through MCP are attributed to the service or agent principal and audited. Approval `ask` results return a pending approval reference the client can poll, or are surfaced to the user in Eclaire.
- **[INTEROP-1a] Harness integration kit (P0).** Not every harness wants MCP, and harnesses differ in how they gate tools. Pi, for example, has TypeScript extensions and packages, skills, RPC and SDK modes, and MCP through an extension, but no built-in permission system. Its current state is summarised in `reference/README.md`; re-verify it when building. So Eclaire ships three equivalent access paths over the same tool registry and permissions:
  - The **MCP server** ([INTEROP-1])
  - The **CLI** with stable JSON output ([CLI-3])
  - An official **Eclaire skill** (SKILL.md) that teaches any harness to search, read, capture and act through the CLI or MCP

  These are packaged as one-step installs: a Claude Code plugin bundling the MCP config and skills, and a Pi package or extension. A settings page generates scoped credentials and a copy-paste setup for each harness. CI runs a smoke suite that drives Claude Code and Pi (headless modes) against a fixture instance.
- **[INTEROP-2] External harness adapters (P1).** An agent's **runtime** is pluggable (Appendix B.9). The built-in runtime is one implementation. Others, in priority order:
  - Claude Agent SDK / Claude Code
  - Pi (via its SDK or RPC mode)
  - Codex (app-server)
  - OpenCode
  - Any process speaking a documented harness protocol

  External runtimes MUST receive the full context (instructions, history, or their native session resume), get Eclaire tools through MCP, and stream their events back translated into the canonical part and event model, including their own tool calls. Approvals for their actions use Eclaire policy where the harness supports hooks. Auto-approve is off by default.
- **[INTEROP-3] Inbound model-style API (P1).** Eclaire agents are callable as "models" via an OpenAI-compatible Chat Completions and Responses endpoint. The model id is `agent:<handle>`, and the call is authenticated by API key. Tools are executed server-side, and the request can be mapped to a Thread.
- **[INTEROP-4] (P2)** A2A (Agent-to-Agent) protocol endpoint for agent discovery and delegation.
- **[INTEROP-5]** Outbound **webhooks** and the **event stream** (§7.4) let external systems react to anything: a new item, a processed item, a finished run, a requested approval.

### 5.10 Agent streaming protocol

- **[STREAM-1]** Agent runs emit a typed event stream compatible with **AG-UI** (or a documented superset, with a published mapping). Events cover:
  - Run lifecycle
  - Message start and end
  - Text and reasoning deltas
  - Tool call start, args delta, end and result
  - Tool progress
  - Approval requested and resolved
  - State snapshots and deltas (for UI state)
  - Citations
  - Errors
- **[STREAM-2]** The stream is delivered over the unified realtime connection (§7.4) and over plain SSE (`GET /runs/{id}/events?cursor=`). Each event has a sequence number for resume.
- **[STREAM-3]** A first-party client SDK (TypeScript) consumes the stream. Its reducer is shared by the web, desktop, mobile and CLI clients.

---

## 6. Surfaces

### 6.0 Client strategy and cross-client UI contract

- **[CLIENT-1] Priority.**

  | Order | Clients |
  |---|---|
  | 1st (P0) | **Web app, full scope**: responsive from phone to desktop and an installable PWA ([PWA-1]). It is the primary client at launch and stays the client for Linux, Windows, Android and admin. |
  | 1st (P0) | CLI and the harness integration kit ([INTEROP-1a]) |
  | 2nd (P1, important) | **Native macOS app in Swift/SwiftUI**, starting once the web app is done. It adds the edge host for Apple data sources and native processors. This is the only native desktop client (decided). |
  | 3rd (P2) | **Native iOS/iPadOS app**, started only after the main scenarios are validated, tested and working well on web and macOS (decided). Until then iPhone and iPad users use the PWA. |
  | Not planned | Native Windows, Linux desktop and Android clients. These users use the web app (decided). |

  The contract-first rules below apply from day one, so the native apps can start without reworking the server.

- **[CLIENT-2] Contract first.** Every client is built only against published contracts:
  - OpenAPI for the API
  - JSON Schemas for events, the sync protocol, agent-stream events and view descriptors
  - The processor and source protocols for edge hosts

  Client SDKs are **generated** from these contracts: Swift (e.g. Apple's swift-openapi-generator) and TypeScript. Shared behaviour that cannot be generated, such as the agent-stream reducer and sync conflict rules, is specified in prose plus **golden test vectors** (recorded event streams with expected resulting state). Both the Swift and TS SDKs MUST pass these vectors.
- **[UI-1] Declarative, schema-driven UI.**
  - Kinds, artifacts, tool results, settings and extension panels describe their presentation with **view descriptors**. These are a small, versioned JSON vocabulary: fields, sections, lists, media, maps, timelines, actions and so on, comparable to Adaptive Cards.
  - All clients render view descriptors natively.
  - A kind with no custom renderer still gets a complete, usable list, tile and detail UI on every client.
  - Bespoke renderers are an optional enhancement per client. Web extensions MAY ship web components; native clients ship bespoke renderers only for first-party kinds.
- **[UI-2]** Feature parity is defined at the level of *capabilities*, not pixels. Every core user capability (capture, browse, search, organise, chat, approve, review, settings) MUST be available on the web and, when they ship, on the native apps. Platform-specific extras are allowed.

### 6.1 Native Apple apps (macOS P1 after the web app; iOS/iPadOS P2 after validation)

- **[APPLE-1]** The apps are local-first. They hold an on-device replica (SQLite) synced through the sync protocol (§4.8), work fully offline for synced scopes, queue offline writes, and support background sync.
- **[APPLE-2] Capture everywhere:**
  - Share extension for URLs, files, images, text and video
  - Shortcuts and App Intents (capture, search, ask an agent, create a task)
  - Siri phrases
  - Apple Watch dictation and quick capture (P1)
  - macOS menu-bar quick capture
  - Global hotkey
  - Services menu
  - Drag onto the Dock icon
  - Paste
- **[APPLE-3] System integration:**
  - **Core Spotlight** indexing of synced items, permission-scoped and per space, with the user's choice of what to expose
  - Quick Look previews
  - Widgets (Inbox, due items, agent activity)
  - **Live Activities** for running agent runs and long processing jobs
  - Handoff between devices
  - Universal Links (`eclaire://` and https)
  - Notification actions for approvals and reviews
  - On macOS: a Finder Sync extension showing linked/indexed status and quick actions (P1)
- **[APPLE-4] The macOS app is also an edge host** (§4.12). It runs local Sources (folders on any Mac, Photos, Reminders, Notes, Calendar, Contacts) and native processors ([PROC-11a]). It can also host the single-user instance ([DEP-7]), replacing the brew launchd service on that machine.
- **[APPLE-5] The iOS app is an edge host for Photos, Reminders, Calendar and Contacts**, within iOS background limits ([EDGE-4]).
- **[APPLE-6] Notifications without an Eclaire-run push relay (decided).** Eclaire is not a SaaS and will not operate an APNs relay. A self-hosted server cannot send APNs to the App Store build, so the apps combine:
  - **Local notifications scheduled on-device** from synced data: due dates, reminders, task schedules. These work offline and on time.
  - The realtime connection while the app is active.
  - Background app refresh to fetch the Inbox and approvals and post local notifications. Delivery is best-effort; iOS controls the timing.
  - **Web push** (VAPID, self-hosted, no third party) for the PWA, including iOS home-screen web apps.
  - Chat channels (Telegram, Slack, Discord) or a self-hosted ntfy/Gotify for time-critical alerts such as approvals.

  The Notifications settings screen MUST explain these trade-offs. Advanced users who build the apps themselves MAY configure their own APNs key (documented, unsupported).
- **[APPLE-7]** Voice: native audio capture and playback for voice sessions (§6.5), with on-device STT and TTS as options. Agent conversations can run hands-free through Siri/App Intents (P1).
- **[APPLE-8] Distribution.**
  - **iOS:** the App Store.
  - **macOS:** direct download (Developer ID, notarized, Sparkle updates) plus Homebrew cask. The Mac App Store sandbox conflicts with running a local server, Full Disk Access sources, spawning processor helpers and AppleScript automation (Apple Notes). A reduced Mac App Store edition MAY come later (P2).
- **[APPLE-9]** Accessibility (VoiceOver, Dynamic Type, keyboard navigation on macOS) and localisation follow platform conventions ([WEB-11] applies by analogy).

### 6.1b Web app (P0: the primary client at launch, full scope, responsive, PWA)

- **[UX-0] UX design step (before Phase 1 UI implementation).** The new UI is designed deliberately. It is not inferred during implementation or carried over from v0.7. This step produces:
  - **Information architecture:** navigation model, spaces, Inbox, kinds, collections, threads, settings.
  - **Key flows:** capture from every surface, triage the Inbox, find with search, chat about items, delegate and review tasks, approve agent actions, link a Source and approve a reorganisation, first-run setup.
  - **Design system:** tokens, components, density, motion, and responsive breakpoints from phone to desktop.
  - **The view-descriptor vocabulary** ([UI-1]), validated against those flows.
  - **The keymap.**
  - **Low- and high-fidelity mockups** for the P0 flows, reviewed by the team.

  Linear is the quality reference for speed, clarity and a keyboard-first design. The inputs are this PRD, the capability checklists in `reference/product-ux.md` and the chosen design references. v0.7's UI is explicitly **not** an input. The outputs live in `docs/design/` and are versioned like the specs.

- **[WEB-1] Schema-driven UI.** Lists, tiles, galleries, tables, detail views, filters, sorts and forms are generated from the kind registry and rendered from view descriptors ([UI-1]). Kinds contribute optional **renderer slots**:
  - Preview
  - Detail panels, such as EXIF, location, GitHub repo or transcript
  - Tile and list templates
  - Actions

  A kind with no custom UI still gets a complete, usable generic UI.
- **[WEB-2] Navigation:**
  - Smart views and Inbox (with counts)
  - Kinds
  - Collections
  - Tags
  - Threads and agent activity
  - Processing
  - Settings

  Also a **command palette** (⌘K) for navigation, actions, search and "ask the agent", and global search with instant results and keyboard navigation.
- **[WEB-3] URL-first state.** Search text, filters, sort, view mode, selected item and open panels live in the URL, so views can be shared and bookmarked and Back restores them. Per-view display preferences are stored server-side.
- **[WEB-4] Assistant everywhere.**
  - A dockable, resizable or full-screen assistant panel.
  - "Ask about this" on any item or multi-selection pre-attaches context.
  - Responses render citations and item links as rich previews.
  - Thinking, tool timeline and approvals are shown inline with progressive disclosure.
  - Shared slash commands (§6.2).
  - Agent switcher.
  - Thread history.
- **[WEB-5]** Bulk operations on multi-selection: tag, untag, move to collection, pin, flag, archive, delete, reprocess, ask the agent.
- **[WEB-6]** Item detail shows:
  - Content and preview
  - Artifacts (browse renditions)
  - Suggestions to accept or reject
  - Processing plan and run history, with per-processor re-run
  - Links and backlinks
  - Comments
  - Change history
  - Related items (semantic, P1)
- **[WEB-7]** Processing console:
  - Live runs and queues by pool
  - Failures, with retry, cancel and view logs
  - Backfills
  - Index lag
- **[WEB-8]** Notes use a rich markdown editor with live preview, `[[link]]` autocomplete, paste or drop of attachments, and offline editing.
- **[WEB-9]** Tasks views ([TASK-1a]): list and board (P0), calendar by due date (P1), "assigned to me", "agent tasks", "needs review", recurring.
- **[WEB-10]** Responsive layout from one component tree. There is no forked mobile app tree.
- **[WEB-11]** Accessibility to WCAG 2.2 AA, complete keyboard operability, and visible focus. i18n-ready: every string is externalised, with locale-aware dates and numbers. English ships first.
- **[WEB-12]** Theming: light, dark and system, with design tokens. Extensions can contribute themes (P2).
- **[WEB-13]** Extensions contribute UI through declared slots:
  - Kind renderers
  - Tool-result renderers (custom cards for a tool's output in the chat timeline)
  - Settings panels, generated from config schemas by default
  - Dashboard widgets (P1)
  - Routes (P2)

  Extension UI is expressed as view descriptors ([UI-1]), so it renders on every client. Optional web-only custom components run as sandboxed web components, with an API surface limited to the client SDK.
- **[WEB-14]** Guided first-run setup:
  - Claim the instance with a setup token
  - Create the admin account
  - Choose a preset (fully local, the recommended default; use existing servers; cloud; mixed)
  - Fully local: hardware check, recommended model bundle, background download (§5.1a). Setup completes without waiting for the download to finish.
  - Advanced: configure providers and assign models to roles manually
  - Run a health check
  - Set the registration policy
  - Optionally import data

  The same state machine drives the CLI.
- **[WEB-15]** The dashboard is configurable. Default widgets: inbox summary, due and upcoming, recent captures, agent activity, storage usage, processing health.

### 6.2 CLI

- **[CLI-1]** The CLI talks **only to the public API**. No direct DB access and no duplicated business logic.
- **[CLI-2]** Authentication:
  - Device-code login, or an API key
  - For bootstrap and admin recovery on the host: a local **admin socket** (a Unix domain socket with filesystem permissions) or a one-time bootstrap token printed by the server

  There is no IP-based trust.
- **[CLI-3]** Commands:

  | Group | Commands |
  |---|---|
  | Setup and health | `setup`/`onboard`, `doctor`, `status` |
  | Data | `items` (search, get, capture, export), `capture <file\|url\|->` (stdin) |
  | Agents and conversations | `chat` (TUI, sharing the stream reducer), `agents`, `threads` |
  | Tasks and automations | `tasks`, `automations` |
  | Models and tools | `providers`, `models`, `mcp`, `skills` |
  | Channels and extensions | `channels`, `extensions` |
  | Admin | `users`, `keys`, `backup`, `restore`, `upgrade`, `reindex`, `reprocess` |
  | Raw | `api` (raw authenticated calls) |

  All of them have JSON output for scripting.
- **[CLI-4]** `eclaire mcp stdio` runs the MCP server over stdio for local harnesses, authenticated with the CLI's credential.
- **[CLI-5]** Slash commands are defined once in the shared client SDK and used by web chat, CLI chat and channels: `/new`, `/clear`, `/history`, `/agent`, `/model`, `/thinking`, `/skills`, `/help`, plus extension-contributed commands.

### 6.3 PWA and other platforms

- **[PWA-1] (P0)** The web app is a first-class PWA:
  - Installable on iOS, Android, macOS, Windows and Linux
  - **Web Share Target** for URLs, text and files (the main mobile capture path until native apps ship)
  - **Web push** via self-hosted VAPID
  - Offline app shell
  - An offline queue for captures
  - **Mobile-first responsive layouts** for every P0 flow, with touch targets, bottom navigation on small screens and safe-area handling
- **[PWA-2] (P1)** A cached offline replica of recently viewed items and pinned collections, using the sync protocol (§4.8). A full offline replica in the browser is P2.
- **[MOB-1]** No Android native app is planned. Android users get the PWA, plus documented Android intent and Tasker recipes against the capture API.
- **[DESK-1]** No native Windows or Linux desktop clients are planned; those users use the web app. The headless `eclaire-edge` daemon for linking folders on non-Mac machines other than the server is P2 and optional.

### 6.4 Chat channels

- **[CHAN-1]** A Channel adapter is an extension (Appendix B.4) declaring capabilities:
  - Text in and out
  - Edit-in-place streaming
  - Threads
  - Buttons and interactive components
  - File in and out
  - Voice notes in and out
  - Typing indicator
  - Message length limit
  - Markup dialect
  - Transport: polling, socket or webhook

  v1 adapters: Telegram, Slack, Discord. P1: email (in and out), Matrix, Signal (via bridge), WhatsApp (Business API).
- **[CHAN-2] Identity linking is mandatory.**
  - An external user is linked to a principal through a pairing flow: a one-time code or deep link from the web app.
  - Messages from unlinked external users are ignored. The adapter MAY reply with pairing instructions, depending on configuration.
  - Each link carries a **scope**: `capture_only`, `read`, `read_write` or `full`, intersected with the user's permissions.
  - For group channels, each sender is checked individually.
- **[CHAN-3]** A **Channel thread mapping** is persisted: (connection, external chat/thread, external user) maps to an Eclaire Thread. Channel conversations show up in the web thread list and can be continued anywhere. Slash-command state is persisted per mapping.
- **[CHAN-4] Inbound media is capture.**
  - Photos, documents, voice notes, audio, video and links sent to a channel become items through the standard ingestion pipeline (§4.2), with source `channel`.
  - The agent then optionally gets a turn about the new item(s): reply with a summary or answer the caption.
  - Voice notes are stored as `media` items with transcripts. The transcript is shown to the user in the reply.
- **[CHAN-5]** Approvals are rendered natively (inline buttons, Block Kit, components) when the channel supports it. Otherwise the user gets a link to the web Inbox.
- **[CHAN-6] Surface rendering.** Agent output goes through a per-surface renderer: markdown converted to the platform's markup, message splitting, code blocks, citations converted to links, and markdown converted to speakable text for TTS.
- **[CHAN-7]** Agent routing: the connection has a default agent, and `@handle` addressing selects another one. Routing applies identically to text and voice.
- **[CHAN-8]** Outbound sends go through the **delivery outbox** (§6.6). Any process can enqueue a send; the process holding the channel connection delivers it. Sends are retried with backoff and their status is recorded.
- **[CHAN-9]** Channel connection runtime state (sockets, polling cursors) is owned by exactly one process, coordinated by a lease. Failover to another process is automatic.
- **[CHAN-10]** A conformance test kit for adapters with fake platforms.

### 6.5 Voice

- **[VOICE-1]** Voice providers are extensions (Appendix B.5). Each declares capabilities:
  - Batch STT
  - Streaming STT
  - Batch TTS
  - Streaming TTS
  - Realtime speech-to-speech
  - Supported languages, voices and formats
  - Locality

  v1 providers: whisper.cpp, mlx-audio, a local TTS such as pocket-tts or Kokoro-class, and ElevenLabs, plus OpenAI-compatible audio endpoints. Locality is enforced by the egress policy.
- **[VOICE-2]** **Voice session** is a duplex, low-latency conversation mode usable from web, desktop and (P1) phone or Discord voice. It includes:
  - Voice activity detection
  - Streaming STT with partial transcripts
  - End-of-turn detection
  - The agent run
  - **Sentence-chunked streaming TTS fed from the token stream**
  - **Barge-in**: user speech cancels TTS and, by policy, the run
  - Push-to-talk as an alternative mode

  Target: under 1.2 s from end of user speech to first audio, on a local stack with a reference model.
- **[VOICE-3]** Native speech-to-speech models MAY be used through the `realtime_voice` role when available. Tools and approvals still go through Eclaire.
- **[VOICE-4]** Per-user voice preferences (provider, model, voice, speed, language, auto-play, auto-send) apply on every surface, including channels.
- **[VOICE-5]** The browser never talks to audio servers directly. All audio goes through Eclaire's authenticated realtime transport.
- **[VOICE-6]** Transcripts and audio are user content. They are never logged and are stored only as items or messages under policy.

### 6.6 Notifications and the delivery outbox

- **[NOTIF-1]** A **Notification** record has: recipient principal, title, body (markdown), severity (`info`, `warning`, `error`, `critical`), category, source (item, run, task, system), actions (deep links and buttons that map to API actions), and `dedup_key`.
- **[NOTIF-2]** **Routing policy** per user: by category and severity, choose targets; set quiet hours (critical notifications can bypass them); choose a digest cadence. Targets are extensions (Appendix B.7): in-app notification centre (always), **web push** (self-hosted VAPID, including iOS home-screen PWAs), native-app local notifications ([APPLE-6]), email (SMTP), chat channels, outbound webhook, ntfy and Gotify-class push (P1).
- **[NOTIF-3]** Every delivery attempt is a **Delivery** record in an outbox (status, attempts, error, external message id). Retries use backoff. Delivery results are visible on the source (for example on a reminder occurrence).
- **[NOTIF-4]** Agents send notifications through a tool. The approval policy defaults are allowing notifications to self and asking before notifying others.
- **[NOTIF-5]** The in-app notification centre is separate from the Inbox. The Inbox holds *work*; notifications are *messages*. A notification can link to an attention item.

---

## 7. Platform and kernel

### 7.1 Identity and authentication

- **[AUTH-1]** Human authentication:
  - Email and password with a strong hash (argon2id)
  - **Passkeys/WebAuthn**
  - **TOTP 2FA**
  - **OIDC SSO** (Authelia, Authentik, Keycloak, Google and others), with optional auto-provisioning
  - Login through a trusted reverse-proxy header (forward auth) is optional and disabled by default. When enabled it requires an explicit trusted-proxy CIDR and a shared secret.
- **[AUTH-2]** Account recovery: email-based password reset when SMTP is configured, admin-initiated reset links, and CLI admin-socket reset.
- **[AUTH-3]** **Instance bootstrap.** On first start the server generates a one-time **setup token**, logs it, and makes it available through the admin socket. Claiming the instance (creating the first admin) requires the token. Registration defaults to **invite-only**. Open registration must be enabled explicitly.
- **[AUTH-4]** Sessions are server-side, revocable, bound to device metadata, and listable per user. Cookies are `HttpOnly`, `Secure` and `SameSite=Lax`, with CSRF protection on state-changing cookie-authenticated requests.
- **[AUTH-5]** API keys:
  - Bound to a principal (service or agent, or a user's personal key).
  - Each key carries a grant (permissions and resource constraints, §7.2), an expiry, a last-used time and IP, and can be revoked.
  - Stored as peppered HMAC with versioning. Shown once, with a displayable suffix.
  - The UI offers presets ("read-only data", "capture only", "full data", "admin") over fine-grained permissions.
- **[AUTH-6]** OAuth 2.1 authorization server, for MCP clients and third-party apps, with PKCE and dynamic client registration as the MCP authorization spec requires. Consent screens show the requested grants.
- **[AUTH-7]** **There MUST NOT be any authentication bypass based on network location, headers, environment or runtime mode.** A test asserts that every route except an explicit public allowlist returns 401 without credentials, in every deployment mode.

### 7.2 Authorization

- **[AUTHZ-1]** A single **policy engine** evaluates `(principal, action, resource, context)` for every request, tool call, search, sync and event subscription. Every request type goes through it: browser sessions, API keys, agents, channels, plugins and system.
- **[AUTHZ-2]** Permissions are declared **per route and per tool**, next to their definitions, and checked by the framework. Inferring them from URL prefixes is forbidden. Routes without a declaration fail closed at startup in tests.
- **[AUTHZ-3]** Permission model:
  - Actions: `read`, `create`, `update`, `delete`, `invoke`, `admin`
  - Resource types: items by kind, collections, tags, threads, agents, automations, channels, settings, credentials, admin
  - Constraints: space, kind set, collection set, tag set, item ids, `own_only`

  Effective permission is the intersection along the delegation chain (user, then key or agent, then sub-agent).
- **[AUTHZ-4]** Browser sessions also carry scopes, the user's full role by default, so that "view as read-only" and limited-role members (P1 shared spaces) use the same machinery.
- **[AUTHZ-5]** Space roles (P1): owner, editor, contributor (create and edit own), viewer. Sharing individual items or collections with other users through links with grants (P2).
- **[AUTHZ-6]** Rate limiting per principal and per IP on auth endpoints, capture, search and agent invocation. Limits are configurable and durable across processes.

### 7.3 API

- **[API-1]** Resource-oriented HTTP JSON API, versioned under `/api/v1`, described by a **complete OpenAPI 3.1** document generated from the route definitions and **served** at runtime, with an interactive reference UI. CI fails if any route lacks a schema.
- **[API-2]** Conventions, enforced by shared middleware and linting:
  - `GET` lists use cursor pagination everywhere: `?cursor=&limit=`, returning `next_cursor`, with total counts on request.
  - `PATCH` uses JSON Merge Patch with `If-Match`.
  - `PUT` only for full replacement.
  - `POST` for create and for actions under `/…/{id}:action` or `/…/{id}/actions/{name}`, used consistently.
  - Errors are **RFC 9457 problem+json** with stable machine `code`s.
  - **Idempotency-Key** is honoured on all non-idempotent POSTs.
  - ETags for conditional GET.
  - Bulk endpoints for common batch operations.
  - Timestamps are RFC 3339 UTC; ids are opaque strings.
- **[API-3]** Generic item endpoints (`/items`, `/items/{id}`, `/items/{id}/artifacts`, `/items/{id}/suggestions`, `/items/{id}/runs`) cover every kind. Kind-specific endpoints are added only for genuinely kind-specific actions.
- **[API-4]** Typed client SDKs are **generated** from OpenAPI. TypeScript is first-party; others are community-generated. The web app, CLI, desktop and channels use the generated TS SDK. Handwritten fetch wrappers over `any` are forbidden.
- **[API-5]** The `/health` endpoints (liveness, readiness, with dependency status) and `/version` are public. Everything else requires auth.

### 7.4 Events, realtime and webhooks

- **[EVT-1]** **Transactional outbox.** Every state change writes its domain events in the same DB transaction. A relay publishes them to the internal event bus. Events use a CloudEvents-style envelope: id, type, source, subject, space, time, sequence, actor, data. Their schemas are registered and versioned, and listed in the docs.
- **[EVT-2]** The internal bus works across processes in every topology, through DB-backed notifications or a pluggable broker. Each process uses **one** subscription connection, never one per client.
- **[EVT-3]** **Unified realtime connection** per client (WebSocket, with an SSE fallback):
  - Authenticated subscriptions to topics: space changes (sync feed), item, run stream, attention, notifications, processing.
  - Each message carries a sequence number; resume uses a cursor.
  - Server-side permission filtering.
  - It also carries audio frames for voice sessions, or a dedicated authenticated WS for audio.
- **[EVT-4]** **Outbound webhooks.** Users and admins subscribe URLs to event types with filters. Payloads are HMAC-signed, retried with backoff, recorded in delivery logs, and have a replay button. Webhooks pass the egress policy check.
- **[EVT-5]** Event types are registered by extensions. A frontend cache never needs a hand-maintained mapping from event types to query keys: events declare the resources they affect, and the client SDK updates its local store from the sync feed.

### 7.5 Jobs and durable execution

- **[JOB-1]** One durable execution substrate serves processing runs, agent runs, automations, source syncs, deliveries, reindexing and maintenance. Required properties:
  - At-least-once delivery, with idempotent handlers keyed by idempotency keys
  - Leases with heartbeats and fencing tokens
  - A **sweeper** that reclaims expired leases, including on the final attempt (sending the job to the DLQ)
  - Per-job timeouts that **abort** the handler
  - Cancellation via abort signal
  - Delayed and scheduled jobs
  - Priorities
  - Per-pool concurrency
  - A dead-letter queue with an admin view
  - Retention of completed runs
- **[JOB-2]** Workers are full peers. Any worker process can run any registered handler whose requirements (pools and capabilities) it satisfies. A topology that leaves some handler type with no eligible worker MUST fail readiness loudly.
- **[JOB-3]** Default backend: the primary database, so no extra infrastructure is needed. A broker backend is optional for scale (§13). Both pass the same conformance suite.
- **[JOB-4]** Multi-step durable workflows are supported, where each step's result is persisted and replay skips completed steps. Agent runs and pipeline plans use this. An off-the-shelf durable-execution engine is acceptable (§13).

### 7.6 Extension system

- **[EXT-1]** An **extension** is a versioned package with a manifest declaring:
  - id, version and compatibility range
  - Contributions: kinds, facets, artifact kinds, processors, tools and toolsets, skills, sources and source actions, channel adapters, voice providers, model provider adapters, notification targets, search backends, blob stores, event types, automations templates, UI slots, settings schema
  - **Requested permissions**: data scopes, network egress hosts, filesystem, subprocess, secrets
  - Resource requirements
- **[EXT-2]** Execution tiers:
  - **Tier 0, core.** First-party, in process, fully trusted, reviewed.
  - **Tier 1, out-of-process.** Runs in a sidecar or container and talks to Eclaire over a documented protocol: the processor protocol, MCP for tools, the harness protocol, a channel bridge protocol. Any language. Third-party extensions default to Tier 1.
  - **Tier 2 (P2), in-process sandboxed.** WASM, for lightweight transforms.
- **[EXT-3]** Admins install, enable, disable, configure and update extensions. Settings UIs are generated from the extension's config schema. Requested permissions are shown at install time and enforced at runtime by the policy engine.
- **[EXT-4]** Every contract (kinds, processors, tools, channels, voice, models, search, blob store, queue, notification targets, sources, view descriptors) ships with a **conformance test kit** that extensions run in their own CI.
- **[EXT-5]** An extension can be removed. Its data (items of its kinds, artifacts) remains readable through the generic UI, or can be exported and purged by choice.
- **[EXT-6] (P2)** An extension index or marketplace with signatures.

### 7.7 Configuration and secrets

- **[CFG-1]** Configuration is defined by **one typed schema**, the only reader of environment and files. Layers, lowest to highest precedence: built-in defaults, config file, environment, DB-stored instance settings (editable in UI and CLI), space settings, user preferences. Every setting declares its layer eligibility, whether a restart is needed, and whether it is secret.
- **[CFG-2]** Minimal required environment for all-in-one: a data directory and a master key, which can be auto-generated on first run into the data dir with a warning to back it up. Everything else has sane defaults or is set in the UI.
- **[CFG-3]** Secrets (provider keys, channel tokens, OAuth tokens, SMTP credentials) are stored encrypted with versioned envelope encryption and rotation support. External secret providers (env refs, files, Vault-class) are pluggable. Secrets are never returned by the API after creation, only masked.
- **[CFG-4]** `eclaire doctor` validates config, connectivity to providers and processor runtimes, permissions, disk and DB health, and model role coverage.

### 7.8 Observability

- **[OBS-1]** Structured JSON logs with request, run and trace ids, and **no user content** by default. Debug content logging requires an explicit, scoped, time-limited toggle.
- **[OBS-2]** OpenTelemetry traces and metrics (export optional). Key metrics:
  - Request latency and errors
  - Queue depth and age per pool
  - Run durations and failure rates per processor
  - LLM tokens, latency and cost per role and model
  - Index lag
  - Sync lag
  - Delivery success
- **[OBS-3]** The admin UI shows system health: dependencies, queues, failing processors, provider status, storage usage, backup status, available version.

### 7.9 Deployment and topology

- **[DEP-1]** **All-in-one**: a single `docker compose up` with at most three containers (app, database, optional processor pack), or a single native binary/process for development and desktop. The local inference engine is managed by Eclaire ([MODEL-8]) or provided externally ([MODEL-11]). On Linux containers it is an optional compose service or a remote server on the network.
- **[DEP-2]** **Scale-out**: one **core node** owns the database. Workers run in other processes or on other machines: processor runtimes, source hosts and edge hosts, for example a GPU box or a NAS. They connect to the core node over the processor and source protocols (HTTP), not through shared DB access. Running several API replicas is supported only if decision D1 selects Postgres. **[PRIN-7] applies.** A CI matrix runs the e2e suite in every supported topology.
- **[DEP-7] Local single-user mode on macOS (P0 via Homebrew).** No Docker and no manual database setup:
  - **Homebrew (P0):** `brew install eclaire` then `eclaire up`, which installs a launchd agent and opens the web app.
  - **Mac app (P1, with the macOS app):** download it or `brew install --cask eclaire`. It hosts the instance as a background login item.

  Requirements:
  - Data lives in `~/Library/Application Support/Eclaire`, in a layout that Time Machine handles safely (DB snapshots via the backup job, not live files).
  - The server binds to `127.0.0.1` by default; LAN or Tailscale exposure is opt-in.
  - Authentication still applies, with no localhost trust ([AUTH-7]). The app provisions a device credential in the Keychain, and the browser is paired by one click from the app or CLI.
  - The Homebrew formula depends on the managed inference engine (D19). Setup's "fully local" preset gives the hardware-sized model bundle, Apple on-device models as an instant-start tier, and reuse of existing Ollama, LM Studio or other servers and caches (§5.1a).
  - Optional capabilities (ffmpeg, yt-dlp, LibreOffice, Docling) are detected. `eclaire doctor` prints the exact `brew install` command for anything missing.
  - The same instance can later be exposed to the user's other devices (iPhone, a second Mac) without migration.
- **[DEP-3]** Images:
  - A slim core image.
  - Optional processor-pack images: office, browser, media (ffmpeg and yt-dlp), document-AI (Docling-class), local-audio.
  - Each pack declares the processors it provides.
  - Images run rootless with read-only root filesystems and multi-arch builds (amd64, arm64).
- **[DEP-4]** GPU and Apple-Silicon acceleration come from external inference servers and audio servers. Eclaire discovers and health-checks them. On macOS the docs cover native MLX servers.
- **[DEP-5]** Hardening for internet exposure: security headers (CSP, HSTS when TLS, frame-ancestors), a strict CORS allowlist, request size limits per route, trusted-proxy configuration for client IP, and a documented reference reverse-proxy setup.
- **[DEP-6]** Upgrades:
  - Forward-only migrations with automatic pre-migration backup.
  - A startup version gate that refuses a downgrade and blocks on a failed migration with a clear message.
  - `eclaire upgrade --check` reports what will change.
  - Zero-downtime migration discipline (expand, then contract) is required for scale-out (P1).

### 7.10 Data stores

- **[STORE-1]** **One relational dialect.** Exactly one primary database engine is supported for production, so there is one schema and one migration set. A second engine is allowed only behind the same conformance suite and only if the team commits to parity in CI (see §13 decision D1).
- **[STORE-2]** All timestamps are stored in one representation. Cursor comparisons are type-correct and tested on the shipping engine.

---

## 8. Security and privacy (consolidated checklist)

Each item must have an automated test or a documented manual check before release.

1. No unauthenticated access outside the public allowlist, in every mode ([AUTH-7]).
2. Setup token for bootstrap; invite-only registration by default ([AUTH-3]).
3. Passkeys, 2FA and OIDC available; argon2id password hashing; rate-limited auth with lockout and backoff ([AUTH-1], [AUTHZ-6]).
4. Per-route and per-tool declared permissions; policy engine on every path; agent permissions intersected with the invoker's ([AUTHZ-1..3], [AGENT-2]).
5. Channel identity linking with per-sender checks ([CHAN-2]).
6. SSRF protection on all fetchers, browsers and webhooks ([PROC-10], [EVT-4]).
7. Untrusted converters and plugins sandboxed out of process ([PROC-10], [EXT-2]).
8. Egress policy enforced for models, tools, webhooks and plugins; egress audit log ([MODEL-5], [HIST-2]).
9. No user content in logs, including transcripts, prompts and documents ([OBS-1], [VOICE-6]).
10. Secrets encrypted, masked and rotatable; optional encryption at rest for content ([CFG-3], [BLOB-4]).
11. CSRF protection, strict CORS, security headers ([AUTH-4], [DEP-5]).
12. Complete deletion honoured, including the change log, index, blobs and backups after rotation ([HIST-4]).
13. Supply chain: lockfile, dependency audit in CI, signed images and an SBOM (P1).
14. A threat model document (STRIDE-style) is maintained for: capture, processing, agent tools, MCP server, channels and extensions.

---

## 9. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | **Scale (reference hardware):** 100k items, 2M chunks, 500 GB of blobs and 10 concurrent users per instance with no degradation beyond the latency targets. |
| NFR-2 | **API latency:** p95 under 100 ms for item get and list (excluding blob transfer). Capture ack under 300 ms. |
| NFR-3 | **Agent overhead:** under 150 ms of time-to-first-token added on top of the model's own TTFT. |
| NFR-4 | **Durability:** zero acknowledged-write loss on process crash. Backups are restorable, verified by a CI restore test. |
| NFR-5 | **Availability (all-in-one):** restart to ready in under 10 s on reference hardware, excluding migrations. |
| NFR-6 | **Resource floor:** all-in-one idle memory under 500 MB, excluding the DB, inference and processor packs. Runs on 4 GB RAM ARM SBC-class hardware with remote inference. |
| NFR-7 | **Web performance:** initial load under 300 KB of JS (gzipped) for the shell. Interaction under 100 ms. Lists virtualised. Images lazy-loaded with thumbnails. |
| NFR-8 | **Offline:** cold start offline in under 2 s with 10k synced items. |
| NFR-9 | **Accessibility:** WCAG 2.2 AA ([WEB-11]). |
| NFR-10 | **Internationalisation:** UI externalised; per-language stemming and analysis in search; time zones correct everywhere, including schedules. |
| NFR-11 | **Portability:** Server on macOS (native, Apple Silicon) and Linux amd64/arm64 (native and container). Clients: macOS and iOS/iPadOS native, supporting the current and previous major OS versions (on-device AI features may require the latest). Web on evergreen browsers. Windows server via containers. |
| NFR-13 | **Mac single-user footprint:** idle memory under 300 MB excluding inference. Install under 150 MB excluding optional packs and models. Cold start under 3 s. |
| NFR-12 | **Licence:** remains open source (MIT today). Extensions may have their own licences. |

---

## 10. Quality and testing requirements

- **[QA-1]** Conformance kits for every extension contract ([EXT-4]), run in CI for all first-party implementations.
- **[QA-2]** CI runs unit, integration (real DB, real blob store), API contract (OpenAPI-driven) and e2e (Playwright) suites on every PR. The integration and e2e suites MUST run in CI, not only locally.
- **[QA-3]** Topology parity: the e2e suite runs in all-in-one and scale-out modes ([DEP-2]).
- **[QA-4]** Security suite: no-auth access sweep across all routes, IP and header spoofing attempts, SSRF probes, permission-intersection tests for agents and keys, channel identity tests.
- **[QA-5]** Egress test: with the default config, run a full capture → process → chat flow under a network sandbox that fails on any non-allowlisted connection.
- **[QA-6]** **AI evals:**
  - Golden sets for processors (OCR accuracy, tagging quality, extraction fidelity)
  - Golden sets for agent tasks (tool selection, retrieval with citations, approval adherence, multi-step task completion)

  The evals run against configured local and reference models, track results over time, and are a gate for prompt and processor version bumps.
- **[QA-7]** Upgrade tests: migrate from the previous release's fixture DB and verify. Restore-from-backup test.
- **[QA-8]** Chaos tests: kill workers and API mid-run. Assert that runs resume or fail cleanly, approvals persist and streams resume ([G4]).
- **[QA-9]** Lint rules: no hard-coded kind lists outside the registry; no direct `process.env` outside config; no `any` in API boundaries; no content logging in designated paths.
- **[QA-10]** Out-of-box tests run on clean macOS VMs or CI runners for each hardware tier. Each covers `brew install`, the setup wizard with the fully-local preset, and a captured item, which must be searchable before models finish downloading and AI-enriched after. A zero-model run asserts that nothing fails and that every AI step reaches `waiting_for_model` ([MODEL-12], S10, S12).

---

## 11. Phasing

The phases are cut so every phase ships something usable and validates the extension API early. Client order follows [CLIENT-1]: the web app first, then macOS, then iOS.

**Phase 0: Kernel (foundation)**
- Identity, auth, policy engine, setup token
- **Multiple spaces and scoped grants** ([SPACE-*]), including the sharing data model. The sharing UI comes later.
- Item store with kind registry and facets
- Blob store (FS and S3)
- Artifacts and suggestions
- Change and audit logs
- Outbox and event bus
- Durable jobs
- Extension registry (Tier 0 and the Tier 1 processor protocol)
- Config
- OpenAPI with generated TS **and Swift** SDKs. The Swift SDK is compiled in CI so the contracts stay native-ready.
- Sync protocol v0 (change feed) with golden test vectors
- View-descriptor spec v0
- Realtime connection
- Health
- Backup
- Homebrew single-user packaging on macOS ([DEP-7]), so the team dogfoods the Mac path from week one

**Exit criteria:**
- The `note` kind is implemented purely as an extension, with full CRUD, history, sync feed and permissions tested.
- The web app renders notes from view descriptors.

**Phase 1: v1, web-first (v0.7 parity and beyond)**
- **UX design step ([UX-0]) first.** It runs in parallel with the kernel's Phase 0 milestones, and UI implementation starts once its P0 flows are approved.
- **Web app, full scope**: responsive, mobile-first, installable PWA with share target, web push and an offline capture queue ([PWA-1], [WEB-*])
- Built-in kinds and processors ([PROC-13]), plus the macOS native processor pack as a brew-installed Swift helper ([PROC-11a]; no app needed)
- Hybrid search with the default local embedding model (D18)
- **Local inference out of the box** ([MODEL-8..15]): managed engine, model manager, hardware-aware catalogue, progressive capability, the Apple on-device tier, the cloud preset
- **Sources v1** (server-hosted):
  - Local folders on the machine running Eclaire (a Mac or NAS) in link, mirror or import mode, with reorganise plan, approve and undo
  - Gmail and Google Drive using the instance's own OAuth client
  - IMAP
  - X bookmarks (mirror)
- Agent runtime: durable runs, canonical transcript, tools registry, approvals policy, skills, MCP client
- **MCP server and harness integration kit** for Claude Code and Pi ([INTEROP-1], [INTEROP-1a])
- Tasks in the Linear style ([TASK-1a]): list and board views, sub-tasks, checklists, projects. Plus triggers and automations.
- Notifications: in-app, web push, channels, ntfy/Gotify
- Telegram, Slack and Discord with identity linking and capture
- Voice: push-to-talk plus streaming TTS
- CLI
- Export
- Security suite
- Topology parity

**Phase 2a: macOS app (P1, important)**
- A native SwiftUI app at capability parity with the web ([UI-2])
- On-device replica
- Share extension, menu-bar capture, global hotkey, Shortcuts, Spotlight, widgets, local notifications
- Hosts the instance ([DEP-7] app path), with a menu-bar view of model downloads, engine status, the memory cap and a pause for background AI ([MODEL-9], [MODEL-15])
- **Edge host** with Sources for:
  - Folders on any Mac
  - Apple Photos (link)
  - Apple Reminders (two-way)
  - **Apple Notes** (import, mirror or link; read-only; experimental)
  - Apple Calendar and Contacts
- Finder tags write-through and the Finder Sync extension

**Phase 2 (P1, alongside 2a)**
- External harness adapters (Claude Code and Pi first)
- Duplex voice sessions with barge-in
- OpenAI-compatible inbound endpoint
- Outbound webhooks
- **Sharing UI** for shared spaces and roles
- Custom fields and kinds
- Custom task statuses and a calendar view
- Memory
- Sub-agents
- Google Calendar and Contacts
- GitHub, Reddit, RSS and email-in
- PWA offline cache ([PWA-2])
- Evals dashboard

**Phase 3: iOS/iPadOS app (P2)**

**Gate:** start only after the main scenarios are validated, tested end to end, and working well on web and macOS.
- Native app sharing the Swift packages from Phase 2a
- Share extension, Shortcuts, widgets, Live Activities
- Edge host for Photos, Reminders, Calendar and Contacts
- Apple Watch quick capture

**Phase 4 (P2, unordered)**
- The `eclaire-edge` daemon for linking folders on non-Mac machines
- CRDT notes
- Offline semantic search
- A2A
- WASM extensions, extension index and signing
- Item-level sharing
- Full web offline replica
- Microsoft 365 Source
- Mac App Store edition
- Takeout importers
- Theming extensions

---

## 12. Decision log and remaining open questions

### 12.1 Decisions (2026-11-07)

| # | Topic | Decision |
|---|---|---|
| 1 | Sharing | The foundation (spaces, members, grants) is in Phase 0. The sharing UI comes in a later phase (Phase 2). |
| 2 | Target market | **Self-hosting for single users, families and small teams.** No hosted SaaS or large-scale deployments for now. A hosted offering may come later but is not a priority (with #5). |
| 3 | Task model | Sub-tasks via one level of `parent` link, plus checklists and projects. **Linear is the UX reference**: clean lists and boards over the same query ([TASK-1], [TASK-1a]). |
| 4 | Notes editor | Markdown as the source format, edited in a block-aware editor. Revisit when adding CRDTs. |
| 5 | Embeddings | The reference machine is a **Mac with an M4 Max and 64 GB**, which also runs the assistant and processing models. The embedding model must be small and efficient. See D18. |
| 6 | Extension trust | Out-of-process (Tier 1) isolation is enough for v1. **No signing on day 1**; signing comes with the extension index (P2). |
| 7 | Desktop app | Important, but **after the web app is done**. "Desktop app" means **the macOS app only** (Phase 2a). Windows and Linux users use the web app. |
| 14 | iOS | A **later phase** (Phase 3), gated on the main scenarios being validated and tested on web and macOS. The PWA covers iPhone and iPad until then. |
| 15 | Embedding model and Pi details | The team confirms these during design and implementation: the D18 bake-off, and the Pi mechanisms for [INTEROP-1a] and [INTEROP-2]. |
| 16 | Inference onboarding | Eclaire installs and manages a local engine and models itself, with hardware-aware bundles, reuse of existing servers, an Apple on-device instant tier, progressive capability, and an optional cloud preset (§5.1a). It is no longer just a plugin. |
| 17 | v0.x | Assume v0.x has no users. No migration, importer or v0 patch releases. Development starts on a clean `next` branch in the same GitHub repo (keeping history, stars and URLs). Versions start at `1.0.0-alpha.N`. The README tells anyone who ran 0.x to start a fresh instance and re-import manually. |
| 8 | Harness strategy | **Both.** The built-in runtime must just work with nothing extra to install. Claude Code and Pi must also work smoothly ([INTEROP-0], [INTEROP-1a]). |
| 9 | Database | **SQLite** (D1), following from #2. |
| 10 | Google | Each instance uses its **own Google Cloud OAuth client**, with guided setup. Eclaire will not seek Google verification at this stage. IMAP is the fallback for mail. |
| 11 | Apple Notes | **Read-only**, with import, mirror and link modes. Marked experimental. |
| 12 | Web app | The web app serves Linux and other platforms. It MUST be fully responsive and PWA-friendly ([PWA-1], S11). It is now the first client, not a reduced-scope one. |
| 13 | Push relay | **No Eclaire-run APNs relay.** Use local notifications, web push and channels instead ([APPLE-6]). |

### 12.2 Still open

None at the product level. Implementation-level confirmations are delegated to the team (decision #15).

---

## 13. Technology recommendations (advisory)

These are recommendations with rationale. The engineering team owns the final decisions; record each one as an ADR.

| # | Decision | Recommendation | Rationale and alternatives |
|---|---|---|---|
| D1 | Primary DB | **Decided: SQLite as the single dialect** (§12 #9). Run it in WAL mode, with FTS5 for lexical search. Vector search sits behind `SearchIndex` (D9). One core node owns the DB, and scale-out happens through the processor and source protocols ([DEP-2]). Backups use the online backup API or Litestream. All data access goes through repository interfaces with a mandatory `space_id` scope, so a future Postgres port for a hosted offering would be a contained project. No such port is built now. | Fits the target (single users, families and small teams), `brew install` to running in minutes, a Mac app that hosts the instance, and the same engine on server and device for Swift clients. What we give up is horizontal API scaling, RLS and LISTEN/NOTIFY, none of which the single-core-node design needs. **One dialect, never two** (the v0.x lesson). |
| D2 | Language and runtime | **TypeScript for the core server, compiled to a single self-contained binary** (Bun `--compile` or Node SEA), so Homebrew and the Mac app need no Node install. **Swift for the Apple apps, the macOS edge host and native processors.** Python sidecars only where the best tool is Python (Docling, some STT), always optional. | TS keeps the best MCP, AI SDK and AG-UI ecosystem, runs the same on a Mac and a Linux NAS, and shares types with the web app. Swift owns everything platform-native. The contract boundary is OpenAPI and JSON Schema ([CLIENT-2]), so neither side leaks into the other. *Considered:* a Swift server (Vapor or Hummingbird) to share code with the apps. It has a weaker AI and MCP server ecosystem and makes Linux/NAS deployment second-class, so it is not recommended. |
| D3 | HTTP and API | Hono (or Fastify), with route definitions in Zod and OpenAPI generated from them. Generate the TS client with a tool such as `openapi-typescript` / `hey-api` / `orval`. | Keep what worked (Hono, Zod). Make OpenAPI complete and authoritative. |
| D4 | Durable execution | With SQLite (D1): an **in-house durable job and step engine** on the core DB. It is a small, well-tested component: leases, sweeper, steps with persisted results. Restate (a single binary, embeddable) is worth evaluating as an alternative. With Postgres: DBOS Transact, pg-boss or graphile-worker plus a run state machine. Remote workers pull work over HTTP ([DEP-2]) in either case. | Agent runs and pipeline DAGs both need durable steps, resume and cancellation; building them twice is what v0.x did. Temporal is powerful but heavy for self-hosting. |
| D5 | Agent runtime and model layer | **Vercel AI SDK (v5+)** or **pi-ai / pi-agent-core** (the TypeScript libraries behind the Pi agent: a unified multi-provider LLM API and an agent loop) for provider adapters and the tool loop. Alternatively, provider SDKs directly behind our own thin interface. Prototype the built-in runtime on the two leading candidates before committing. Pi's libraries are attractive because Pi is also an interop target ([INTEROP-0]). Keep the canonical part model internal. | Don't hand-roll adapters again. Make sure provider-native features (thinking signatures, caching) are preserved ([MODEL-2]). For external harnesses: the Claude Agent SDK, the Codex app-server protocol. |
| D6 | Agent UI protocol | **AG-UI** events (with a TS client), or the AI SDK UI message stream if D5 is the AI SDK. Document the mapping. | Interop with existing chat UIs and agent frontends. |
| D7 | MCP | Official `@modelcontextprotocol/sdk`: server (streamable HTTP + stdio) and client. OAuth 2.1 per the MCP auth spec. | The industry-standard way to bring harnesses to data. |
| D8 | Auth | Better Auth (passkeys, 2FA, OIDC, OAuth provider plugins) **or** Ory/Authelia-delegated OIDC. Policy engine: in-house typed policies (Cedar-style semantics, possibly the `cedar` WASM engine), plus a mandatory `space_id` predicate injected by the repository layer, with a lint/test that fails on unscoped queries. If D1 is Postgres, add RLS as defence in depth. | Requirements over library: declared permissions, intersection semantics, no bypass. |
| D9 | Search | Behind `SearchIndex`: FTS5 (BM25, with per-language tokenisers) plus a vector index. Use sqlite-vec with int8 vectors up to about 1M chunks; beyond that, an embedded HNSW (usearch, or LanceDB). Fusion via RRF. Optional Meilisearch or Typesense backends via extension. Embedding model in D18. Embeddings via the `embedding` role (local default, e.g. a small multilingual model on llama.cpp or TEI). | One engine with the same semantics everywhere ([SRCH-5]). |
| D10 | Sync | An **in-house sync protocol**: the change feed ([SYNC-1]), scoped subscriptions, client mutations with base `rev`, and field-level LWW. On Apple clients the store is **SQLite via GRDB** (or SwiftData only if it can model the replica cleanly; GRDB is recommended for control). The web store is IndexedDB or SQLite-WASM. | Off-the-shelf engines (Zero, ElectricSQL) are JS- and Postgres-centric and don't serve Swift clients. PowerSync has a Swift SDK but needs a Postgres, MySQL or Mongo source. Our conflict model is simple enough that owning the protocol (with golden test vectors, [CLIENT-2]) is lower risk than adapting one. |
| D11 | Clients | **Apple:** SwiftUI with platform frameworks (App Intents, Core Spotlight, WidgetKit, ActivityKit, PhotoKit, EventKit, Vision, Speech, Foundation Models). It uses a generated Swift API client and a shared Swift package for sync, the stream reducer and the view-descriptor renderer, shared across macOS and iOS. **Web:** React 19 + TanStack Router/Query, shadcn/Radix, Tailwind, with a view-descriptor renderer. | Native gives the best experience on the priority platforms. Keep the web stack from v0.x: its problems were architectural, not the framework. |
| D12 | Blob store | FS plus S3-compatible (MinIO or Garage for self-host). Content-addressed layout. | Complete S3 support was missing in v0.x. |
| D13 | Processor packs | **Linux/NAS:** container images per pack: Gotenberg-class for office and Chromium, Docling-serve, an ffmpeg and yt-dlp pack, a Playwright pack with an SSRF-guarding egress proxy. **macOS:** the Swift native pack ([PROC-11a]), plus brew-installed tools detected at runtime (ffmpeg, yt-dlp, LibreOffice cask; optional Docling via `uv`), run as sandboxed subprocesses. Every pack speaks the processor protocol. | This removes multi-GB native dependencies from the core and gives isolation ([PROC-10], [PROC-11]). On a Mac, Apple frameworks cover OCR, HEIC, PDF, thumbnails and STT with nothing to install. |
| D14 | Observability | Pino → OTel logs; OTel SDK for traces and metrics; optional Grafana/OTel collector compose profile. LLM traces are compatible with OpenInference / OTel GenAI semantic conventions. | Standard and exportable. |
| D15 | Tooling | pnpm monorepo, oxlint and oxfmt, Vitest, Playwright, Changesets. Pin one pnpm version across the Dockerfile and `packageManager`. | Keep. Stop churning tooling. |
| D16 | Apple distribution | macOS: Developer ID, notarized, Sparkle updates, Homebrew cask (app) and formula (headless server binary). iOS: App Store, with TestFlight for betas. | Required for local-server, Full Disk Access and AppleScript capabilities ([APPLE-8]). |
| D17 | Notifications without a relay | Self-hosted **web push (VAPID)** via a standard library such as `web-push`; native-app **local notifications** scheduled from synced data; ntfy and Gotify as targets. | Follows decision #13 (no Eclaire-run APNs relay) while keeping reliable reminders and approvals ([APPLE-6], [NOTIF-2]). |
| D18 | Embeddings and reranking | **Default: Qwen3-Embedding-0.6B** (Apache-2.0, multilingual, 32k context, Matryoshka-truncatable). Serve it as a Q8 GGUF through llama.cpp `--embedding` or Ollama, or through MLX on a Mac, at **512 dimensions** with **int8** storage. **Lighter alternative:** EmbeddingGemma-300M at 256 dimensions. It is about half the size, but the Gemma licence terms are not OSI, so download it at setup rather than bundling it. **Reranker:** off by default. Optionally Qwen3-Reranker-0.6B on the top 30 results for agent retrieval only. Embedding runs in a **low-priority `embedding` pool** that yields to interactive chat on the shared GPU ([PROC-9]). | Fits the M4 Max 64 GB reference machine that also runs the chat and processing models: under 1 GB resident at Q8 and good multilingual quality. Vector size: 1M chunks at 512 int8 dimensions is about 0.5 GB, versus about 4 GB at 1024 float32. **Bake-off targets (§12.2 #3):** backfill 1M chunks in under 8 hours while idle; keep interactive chat TTFT degradation under 15% while embedding runs. Store the embedding model id and dimensions per index. Changing the model triggers a re-embed through processor reconciliation ([PROC-3]). Check MTEB for newer small models at bake-off time. |
| D19 | Managed local inference engine | **llama.cpp `llama-server`** as the managed engine. It is cross-platform, uses Metal on Apple Silicon, serves GGUF models from Hugging Face, has embeddings and an OpenAI-compatible API, and has a Homebrew formula. Use its multi-model or router mode for on-demand loading if it is mature at build time; otherwise supervise one process per model. Evaluate an **MLX** backend (mlx-lm / mlx-vlm) on Macs for speed. Ollama and LM Studio stay supported as external servers ([MODEL-11]), not as the managed engine. | llama.cpp is the lowest-common-denominator engine that runs everywhere, and v0.7 already managed it. Being able to bundle and supervise it matters more than a few percent of speed. Verify the current router capabilities and MLX parity in a spike. |

---

## Appendix A: v0.x → rebuild concept mapping

| v0.x | Rebuild |
|---|---|
| 6 entity tables + 6 tag join tables + per-type services | `items` + kind registry + facets + `item_tags(source, confidence)` |
| `*StorageId` columns, unlisted worker files | `artifacts` table with provenance |
| `reviewStatus` (two incompatible meanings), `attentionStatus` | Suggestions + attention items + task `review_state` |
| `history` (change log + audit + prompt log) | Change log, audit log, threads/runs |
| Per-type imperative processors, stage labels | Processor registry + pipeline plan DAG + reconciliation |
| `processingStatus` column + `queue_jobs` placeholder rows | Derived `processing_state` from durable Runs |
| `RuntimeAgent` + legacy `ToolLoopAgent`, two orchestration paths | One durable agent run engine on a standard SDK |
| Static tool map, internal-only | Tool registry → internal runtime, MCP server, API, harness adapters |
| Hard-coded `needsApproval` per tool | Approval policy engine; approvals persisted, resolved from any surface |
| `cli_jsonl` "external harness" providers (stateless, toolless) | Harness adapters with full context, Eclaire tools via MCP, canonical events |
| MCP client only | MCP client + **MCP server** |
| Task `scheduleType`/`scheduleRule` + `queue_schedules` + overdue cron | Unified triggers and automations; occurrences are Runs |
| Channel rows, in-memory bot sessions, no sender check | Surface connections + identity links + persisted channel-thread mapping + delivery outbox |
| `POST /api/notifications` fan-out ×3 | Notification records + routing policy + targets + outbox |
| Per-tab SSE + per-request POST-SSE + STT-only WS | One authenticated realtime connection with topics and resume; AG-UI run streams |
| Scopes inferred from URL prefix; session/localhost = `*` | Declared per-route/tool permissions; policy engine for every principal; no bypass |
| First registrant = admin | Setup token + invite-only default |
| CLI writes DB directly | CLI over public API + admin socket |
| Postgres + PGlite + SQLite dialects | One dialect (D1) |
| PWA shell cache only | Change feed + local replica + offline capture + share target |
| Electron URL wrapper, PWA shell-only | Responsive, installable web app/PWA first; then native SwiftUI macOS app (also an edge host), then iOS |
| Import-only connectors (X sync hard-coded in services) | Sources with import, mirror and link modes; edge-hosted Sources for on-device data; write-back actions with plan, approve and undo |
| One flat workspace per user | Multiple spaces per user + nestable collections + scoped grants |

---

## Appendix B: Extension contract sketches

These are illustrative only. Names and shapes will change, but each contract should keep these responsibilities.

### B.1 Kind

```ts
defineKind({
  id: "bookmark", version: "1.0.0",
  label: { singular: "Bookmark", plural: "Bookmarks" }, icon: "bookmark",
  facets: ["web", "schedulable"],
  props: z.object({
    url: z.string().url(), normalizedUrl: z.string(),
    siteName: z.string().optional(), author: z.string().optional(),
    lang: z.string().optional(), publishedAt: z.string().datetime().optional(),
  }),
  capture: [{ match: { url: "*" }, priority: 10 }],
  dedupe: { key: (p) => p.normalizedUrl },
  text: { title: "A", summary: "B", artifacts: { "text.markdown": "C" }, props: { url: "D" } },
  pipeline: ["web.fetch", "web.readable", "web.snapshot", "ai.describe", "ai.tag", "index.chunk", "index.embed"],
  ui: { preview: "artifact:snapshot.screenshot", detailPanels: ["web.source-card"], filters: ["props.siteName"], sorts: ["content_at"] },
  sync: { blobs: { "image.thumbnail": "eager", "*": "on_demand" } },
  tools: { generate: true },
});
```

### B.2 Processor

```ts
defineProcessor({
  id: "doc.docling", version: "2.1.0",
  accepts: { kinds: ["document", "image"], mime: ["application/pdf", "application/vnd.openxmlformats-*", "image/*"],
             missing: ["text.markdown"] },
  requires: { runtime: "docling-pack", pool: "docai", network: "none" },
  produces: ["text.markdown", "text.plain", "extraction.docling_json"],
  fallbackGroup: "text-extraction", fallbackOrder: 10,
  privacy: "local-only", timeoutMs: 300_000, retry: { max: 3, backoff: "exponential" },
  config: z.object({ ocr: z.boolean().default(true) }),
  async run(ctx: ProcessorContext): Promise<ProcessorResult>  // ctx: item, inputs (artifacts/blobs as streams), config,
                                                               // models (role-routed, egress-checked), progress(), signal, log()
});
// Out-of-process processors implement the same contract over HTTP:
// POST /process {item, inputs:[signed URLs], config} → streamed progress events → {artifacts:[…], suggestions:[…]}
```

### B.3 Tool

```ts
defineTool({
  name: "items.search", description: "...", guidance: "Prefer filters over free text when ...",
  input: SearchQuerySchema, output: SearchResultSchema,
  effect: "read", permissions: [{ action: "read", resource: "items" }],
  approval: "allow", result: { maxTokens: 4000, overflow: "page" },
  availability: { surfaces: "*", background: true },
  ui: { renderer: "core.search-results" },
  async execute(input, ctx /* principal (intersected), signal, progress, run */) { … },
});
```

### B.4 Channel adapter

```ts
defineChannel({
  id: "telegram", capabilities: { stream: "edit", threads: false, buttons: true, files: ["in", "out"], voice: ["in", "out"],
                                  maxLength: 4096, markup: "telegram-html", transport: ["polling", "webhook"] },
  config: TelegramConfigSchema /* secrets marked */,
  start(conn, host: ChannelHost): Promise<Stoppable>,   // host.ingest(), host.message(thread, parts), host.resolveIdentity()
  send(conn, target, rendered: RenderedMessage): Promise<DeliveryReceipt>,
  renderApproval(req): RenderedMessage, renderer: SurfaceRenderer,
});
```

### B.5 Voice provider

```ts
defineVoiceProvider({
  id: "whisper-cpp", locality: "local",
  capabilities: { stt: { batch: true, streaming: false, languages: ["*"] }, tts: null },
  transcribe(audio, opts, signal): Promise<Transcript /* segments with timestamps */>,
  transcribeStream?(frames: AsyncIterable<PCM>, opts, signal): AsyncIterable<PartialTranscript>,
  synthesize?(text, opts, signal): Promise<Audio>, synthesizeStream?(text: AsyncIterable<string>, opts, signal): AsyncIterable<AudioChunk>,
  voices?(): Promise<Voice[]>, health(): Promise<Health>,
});
```

### B.6 Source

```ts
defineSource({
  id: "apple.reminders", host: "macos" | "ios",           // or "server", "any_edge"
  auth: { type: "os_permission", permission: "reminders.fullAccess" },
  modes: ["link"], twoWay: true,
  maps: { kind: "task", fields: { title: "title", due_at: "dueDate", status: "isCompleted→done|todo", "props.list": "calendar.title" } },
  scope: z.object({ lists: z.array(z.string()).optional() }),          // user-configurable include/exclude
  changes: "os_events",                                               // push | webhook | cursor_api | os_events | poll
  async *scan(ctx): AsyncIterable<ExternalRecord>,                    // initial enumeration (resumable via ctx.cursor)
  async *watch(ctx): AsyncIterable<ExternalChange>,                   // upsert | move | delete, each with external_id + version
  fetch?(ctx, externalId, signal): Promise<ReadableStream>,           // on-demand original (link mode)
  actions: {
    complete: defineSourceAction({ effect: "write", input: z.object({ id: z.string() }), reversible: true, run, undo }),
    create:   defineSourceAction({ effect: "write", input: TaskDraft, reversible: true, run, undo }),
  },
  writeThrough?: { tags: false },
});
// The host runtime (server, or a Swift edge host for macos/ios sources) provides ctx: cursor storage, emit(), rate limits,
// signal, log, and the space/collection routing from the Source's configuration. Swift edge hosts implement the
// same contract natively, and the server sees the same Source protocol messages either way.
```

### B.7 Notification target

```ts
defineNotificationTarget({ id: "webpush", config: …, deliver(notification, recipientEndpoint, signal): Promise<DeliveryReceipt> });
```

### B.8 Model provider adapter

```ts
defineModelProvider({
  id: "anthropic", dialect: "anthropic-messages", locality: "remote",
  listModels(): Promise<ModelInfo[]>,
  generate(req: CanonicalRequest, signal): AsyncIterable<CanonicalStreamEvent>, // preserves reasoning/signatures/caching/citations
  embed?(inputs, signal), rerank?(query, docs, signal),
});
```

### B.9 Agent runtime (harness) adapter

```ts
defineAgentRuntime({
  id: "claude-agent-sdk",
  capabilities: { resume: true, hooks: ["pre_tool_use"], mcp: true, images: true },
  start(run: RunSpec /* instructions, transcript or native session id, MCP endpoint + scoped token, budgets, policy hooks */,
        signal): AsyncIterable<CanonicalRunEvent>,
});
```

### B.10 Search index, blob store, queue

These are storage-level contracts (`SearchIndex.upsert/delete/query`, `BlobStore.put/get/head/delete/list/sign`, `Queue.enqueue/claim/heartbeat/complete/fail/cancel/schedule`). Each has a conformance suite. They are swappable through extensions, but only first-party implementations are expected in v1.

---

## Appendix C: Behavioural rules carried over from v0.7

These rules were distilled from the v0.7 reference notes (`reference/*.md`). They carry the same weight as the requirements in the body of this document.

- **Source:** each rule records a behaviour users relied on, or a trap v0.7 fell into, phrased independently of any design.
- **IDs:** the IDs match the `[Rule …]` labels in the reference notes. Where several notes produced the same rule, it is listed once under all of its IDs.
- **Cross-references:** brackets point to the requirements a rule refines.
- **Tests:** every rule needs at least one test.

### C.1 Capture and classification

- **RULE-WEB-1 / RULE-DOC-1 / RULE-MEDIA-8** [CAP-1]:
  - A capture MUST be classified by what its content actually is, using its bytes or its resolved URL.
  - A type declared by the client, whether wrong or generic, MUST NOT override what the content shows. No user action may be needed to classify a capture.
- **RULE-WEB-4** [CAP-1]: A kind the user explicitly chooses MUST win over automatic classification, and every kind MUST be choosable.
- **RULE-WEB-2** [KIND-1]: Pasted text MUST become a bookmark only when it is unambiguously a single web address. Filenames, version strings and text that merely contains a URL stay text.
- **RULE-WEB-3** [CAP-1]: A bookmark URL MUST use `http` or `https`. Any other scheme is rejected, never rewritten into a web URL.
- **RULE-WEB-5** [CAP-3]: A bookmark MUST keep and show the URL the user actually saved. The canonical URL used for deduplication and routing is stored separately.
- **RULE-WEB-6** [DATA-1]: Imported items MUST keep their original save date from the source, not the import date.
- **RULE-WEB-9** [SRC-1]: Re-running an import or sync MUST NOT duplicate items it already imported.
- **RULE-MEDIA-1** [CAP-1]: A URL import MUST show the new item immediately. Its file, title, description and transcript then fill in with no further user action.

### C.2 Processing outcomes and provenance

- **RULE-DOC-3 / RULE-DOC-7 / RULE-MEDIA-4 / RULE-WEB-14** [PROC-5]:
  - A failure in an optional or enrichment step MUST NOT fail the item. This covers metadata, previews, screenshots, site API calls, transcript sources and AI analysis.
  - The item completes with whatever succeeded, and visibly shows what is missing or partial.
  - Usable but incomplete output, such as truncated OCR, MUST be kept and marked as partial, never discarded.
- **RULE-DOC-9** [PROC-5]: A document whose text extraction fails or comes back empty MUST still be stored and previewable. It is visibly flagged with the reason, rather than silently missing from search. The flag is not stored as a user tag.
- **RULE-DOC-2** [PROC-7]: When the preferred extractor is unavailable or fails, any other capable extractor MUST be used. The text from whichever extractor succeeded MUST be stored and made searchable.
- **RULE-WEB-7** [PROC-7]: When a site-specific handler cannot serve a URL (unsupported URL shape, missing credentials, API unavailable), capture MUST fall back to generic web capture rather than fail.
- **RULE-WEB-13 / RULE-MEDIA-2** [PROC-8]: Titles, descriptions and tags the user supplied, at capture or later, MUST survive processing. Automated results never overwrite or remove them. A fetched title replaces a placeholder only if the user has not changed it.
- **RULE-WEB-10** [PROC-9]: A failure that doesn't show a site is down MUST NOT count toward throttling or blocking that site. This includes 404 and 403 responses, local processing errors and unknown errors.
- **RULE-DOC-6** [ART-3]: Every item MUST have a recognisable visual in grids and detail views, including items that failed to convert. A failure to produce a preview never fails the rest of processing.

### C.3 Content fidelity

- **RULE-DOC-4** [PROC-13]: Text MUST be decoded in its actual character encoding (Latin-1, UTF-16 and so on), so it is readable and searchable without mangling.
- **RULE-DOC-11** [PROC-13]: Every accepted image MUST display correctly oriented in every supported client, whatever its original format.
- **RULE-DOC-12** [CAP-1]: Corrupt, truncated or unreadable image metadata MUST NOT fail a capture. The item is stored without that metadata.
- **RULE-DOC-13** [SRCH-3]: Photos MUST sort and filter by when they were taken when that is known, and otherwise by when they were added.
- **RULE-DOC-15** [PROC-13]: Text visible in images (screenshots, scans, receipts, whiteboards) MUST become searchable text of the item.
- **RULE-MEDIA-9** [PROC-13]: The spoken content of audio and video items MUST become searchable text that agents can read.
- **RULE-MEDIA-5** [PROC-13]: Imported media MUST be playable in the user's client without the user converting anything.
- **RULE-WEB-8** [PROC-13]: Saving a discussion post MUST preserve the discussion as well as the post, including comments. It must be readable without the site's UI, and searchable.

### C.4 Limits

- **RULE-DOC-8 / RULE-UX-11** [DEP-5]:
  - Size limits MUST be declared once by the server, per kind, and enforced the same way along the whole upload path and in every client.
  - A file the UI accepts is never rejected by a hidden or lower limit.
  - No single upload may take the server down.
- **RULE-MEDIA-6** [CAP-1]: Size limits MUST be enforced on the bytes actually received, aborting mid-transfer once exceeded. A declared size, such as `Content-Length`, is never trusted alone.

### C.5 Security and privacy

- **RULE-WEB-11 / RULE-MEDIA-3** [PROC-10]:
  - Server-side fetches of user-supplied URLs MUST accept only `http` and `https`.
  - They MUST refuse private, loopback, link-local and cloud-metadata addresses and internal service names, unless explicitly allowlisted.
  - This applies to every redirect hop, page subresource and icon fetch. Each hop is re-validated against the resolved address.
- **RULE-MEDIA-15** [PROC-10]: Attachments received through a chat platform MUST be fetched only from that platform's own content hosts.
- **RULE-MEDIA-7** [PROC-10]: A filename taken from a remote source MUST NOT be able to cause path traversal.
- **RULE-DOC-5** [PROC-10]: Processing user-supplied HTML or Markdown (extraction, rendering, previews) MUST NOT run its scripts or let it make network requests.
- **RULE-DOC-10 / RULE-WEB-12** [BLOB-2], §8: Viewing, previewing or downloading captured or uploaded content MUST NOT let it run script with the app's origin, cookies or credentials. This covers HTML, SVG, XML and web snapshots.
- **RULE-DOC-14** [MODEL-5]: Turning coordinates into a place name MUST NOT send those coordinates to a third party unless the user's policy explicitly allows it.
- **RULE-MEDIA-12** [VOICE-5]: A voice streaming connection MUST be authenticated and authorised before any audio is accepted.

### C.6 Models and agents

- **RULE-AI-1** [MODEL-1]: Every provider endpoint (base URL and optional credential) MUST be configurable by the user. No host, port or path is assumed to be fixed.
- **RULE-AI-2** [MODEL-2]: Model reasoning MUST be shown apart from the answer and MUST NOT leak into the answer text, however the server delivers it.
- **RULE-AI-3** [CFG-3]: A call with a missing or unresolvable credential MUST fail with a clear error naming what is missing. It is never sent with a blank or placeholder credential.
- **RULE-AI-4** [TOOL-1]: Malformed tool-call arguments MUST be returned to the model as a visible tool error so it can retry. They are never silently replaced or dropped.
- **RULE-AI-5** [MODEL-3]: When a request needs capabilities the selected model lacks, the user MUST get one clear message listing every unmet capability, not a provider error.
- **RULE-AI-6** [MODEL-3]:
  - Before local models start, the user MUST see whether all the models that will run at the same time fit in available memory, with a breakdown.
  - Starting a configuration that doesn't fit requires an explicit override.
- **RULE-AI-7** [TOOL-3]: Anything a user can do to their own data in the UI MUST also be possible for the assistant, under the same permissions and approval policy.
- **RULE-AI-8** [RUN-7], [QA-6]: The assistant MUST NOT claim an action was done unless it was actually performed and succeeded in that run. This is checked by the agent eval suite.
- **RULE-AI-9** [MEM-3]: The assistant MUST know the current date and time and the user's time zone. It resolves relative times ("tomorrow at 9") against them before acting.

### C.7 Voice and channels

- **RULE-MEDIA-10** [VOICE-1]: Voice controls and options MUST appear only when a usable provider supports them. Streaming options take effect only when the chosen provider advertises that capability.
- **RULE-MEDIA-11** [VOICE-2]: Pressing the mic or stop MUST silence all assistant speech immediately, including audio already queued or scheduled.
- **RULE-MEDIA-13** [VOICE-2]: Stopping dictation MUST deliver the final text promptly and never discard text already recognised.
- **RULE-MEDIA-16** [CHAN-6]: A failure to produce or send a spoken reply MUST NOT stop the text reply from reaching the user.
- **RULE-MEDIA-14** [CHAN-1]: A channel message that cannot be handled MUST get a reply saying so, never silence. This covers processing failures, rate limits, and channels that don't accept input.
- **RULE-UX-12** [CHAN-3]: On platforms with threads, replies MUST go into the originating thread, and each thread maps to its own conversation.
- **RULE-UX-13** [NOTIF-3], [ORG-5]: A notification or reminder with no deliverable target MUST be surfaced to the user, for example as a `failure` attention item. It is never dropped silently.

### C.8 Tasks, attention and time

- **RULE-UX-1** [TASK-1a]: A task MUST be completable, and a completed task reopenable, in one action from any list that shows it.
- **RULE-UX-2** [RUN-8], [ORG-5]: When the system is waiting on a human (review, approval, question), that MUST be shown as waiting on the user, never as busy or in progress.
- **RULE-UX-3** [TASK-3]: Pausing recurring work MUST be a property of its trigger, not a task status. "Paused" and "blocked" never share a representation.
- **RULE-UX-4** [TASK-1]: Sorting by priority MUST place "no priority" after every set priority.
- **RULE-UX-5** [TASK-1]: When a human assigns a task to an agent without choosing a mode, the delegation mode MUST default to `assist` (human review), never `autonomous`.
- **RULE-UX-6** [TASK-2]: "Request changes" MUST be one explicit action that carries feedback and starts the revision run. An ordinary comment never starts an agent run.
- **RULE-UX-7** [TASK-4], [PRIN-4]: State derived from runs (latest result, status, attention) MUST be updated only from the most recent run. An older concurrent run never overwrites a newer result.
- **RULE-UX-8** [TASK-5], [MEM-3]: Date logic the user sees (due today, overdue, fire times, relative times) MUST use the user's or space's time zone, never the server's. "Overdue" means the same thing on every surface.
- **RULE-UX-9** [ORG-5]: Due and overdue attention MUST resolve automatically when the task is completed or cancelled, or when its due date moves out of range.

### C.9 Input

- **RULE-UX-10** [WEB-11]: Single-key shortcuts MUST NOT fire while focus is in a text input.

### C.10 Setup, operations and CLI

- **RULE-UX-14** [WEB-14]:
  - Setup MUST derive step completion from real system state. It is resumable, idempotent and tolerant of changes made outside it.
  - An already-configured instance is never sent through first-run setup again, including after an upgrade.
- **RULE-UX-15** [PORT-2]: A backup MUST be self-sufficient and verifiable:
  - It includes the keys needed to decrypt stored secrets, always encrypted.
  - It carries an app-version stamp that is checked on restore.
  - It can be validated by a test restore.
- **RULE-UX-16** [DEP-6]:
  - The startup gate MUST tell "database unreachable" apart from "database empty", and never initialises an unreachable database.
  - When it refuses to start, it stays up in a degraded state that shows the reason and the fix, rather than exiting into a restart loop.
- **RULE-UX-17** [CLI-3], [INTEROP-1a]: In machine-readable mode, stdout MUST carry only data, with banners and progress on stderr. Every command exits non-zero on failure.
