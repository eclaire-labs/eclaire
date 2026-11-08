# v0.7 reference notes

> **Non-normative.** These documents preserve the *intent* and *hard-won lessons* of Eclaire v0.7 so they aren't lost in the rebuild. **[`../PRD.md`](../PRD.md) is the source of truth.** Where a note here disagrees with the PRD, the PRD wins. v0.7's code is not available to the rebuild, and its structure, module layout and naming must not be reproduced.

## When to read these notes (rules for agents and people)

- **Not during architecture, spec or UX design work.** Design from the PRD, the specs and a fresh design pass. Every Rule from these notes is already mirrored in **PRD Appendix C**, so the PRD is self-contained.
- **UX and UI design** starts from the PRD (§6), the **capability checklists** in `product-ux.md`, and the design references chosen in the UX design step (PRD [UX-0]). Linear is the quality bar. `product-ux.md` Appendix A ("v0.7 UI inventory") is **not** design input.
- **When implementing a specific processor, source, channel, provider or harness integration**, read only that topic, after the relevant PRD section and spec. Use it to write tests and to avoid known traps.
- **Never load the whole folder into context by default.**

## How to read a topic

Every topic is split into the same six parts:

| Part | How to treat it |
|---|---|
| **User intent** | Requirements context. It should already be reflected in the PRD; if it isn't, raise it. |
| **Observations** | Each bullet carries one label: <br>**[Fact]**: external or platform truth (APIs, formats, limits, tool behaviour). Keep it and turn it into tests. <br>**[Rule RULE-…]**: a requirement we want regardless of design, mirrored in PRD Appendix C. <br>**[v0.7 choice]**: what v0.7 happened to decide (numbers, mappings, defaults, naming). Inventory only, free to change. |
| **Capabilities (must be possible)** | Used in UI topics instead of Observations: what a user must be able to do, with no layout or interaction prescription. |
| **How v0.7 did it** | Background only. **Do not copy it.** |
| **Known problems in v0.7** | Anti-patterns. Each one should be prevented by design or by a test. |
| **Better options today** | Leads to evaluate, usually in a spike or ADR. They are not decisions. Check that each is still current before relying on it. Lines starting "Idea:" are suggestions, not requirements. |
| **PRD refs** | Where the topic lands in the new design. |

Two more rules:

- **Prompt appendices** are an *evaluation baseline* only. Use them to measure new prompts and models against v0.7 output quality (PRD [QA-6]). Do not use them as templates.
- **Candidate fixtures** point at files in the frozen v0.7 repository. Copy the useful ones into the new repo's test fixtures and build the missing ones the notes call for. Notably, v0.7 had no recorded HTML, site-API or media fixtures.

## Notes

| Note | Covers |
|---|---|
| [web-capture.md](./web-capture.md) | Capture classification; URL normalisation; fetch and Readability; headless-browser snapshots; GitHub, Reddit and X handlers; X bookmark sync; per-domain rate limits; SSRF; bookmark tagging |
| [documents-images.md](./documents-images.md) | Format routing; Docling; native extractors (pdftotext, LibreOffice, iWork); PDF renditions; thumbnails; image normalisation (HEIC); EXIF and geocoding; image classification and its branches; OCR; native dependencies |
| [media-voice.md](./media-voice.md) | yt-dlp import; ffprobe and ffmpeg; transcript tiers; the five STT/TTS providers' wire formats; streaming STT and TTS in the browser; voice notes over Telegram, Discord and Slack |
| [ai-models-agents.md](./ai-models-agents.md) | Model-server quirks (reasoning fields, thinking toggles); model metadata and import; memory estimation; driving the Claude Code, Codex and OpenCode CLIs; MCP client modes; browsing tools; the tool catalogue as a capability checklist; system-prompt intent; skills; local engine management; Pi integration notes |
| [product-ux.md](./product-ux.md) | Task, attention and Inbox semantics; views and triage metadata; assistant UX and slash commands; keyboard shortcuts; upload limits; Telegram, Slack and Discord specifics; notifications; onboarding; settings; backup and upgrade lessons; desktop and CLI UX |

## Cross-cutting lessons surfaced by the extraction

These are worth turning into tests early. Each is detailed in the note named in brackets.

**Limits and configuration**

- **Limits must be consistent end to end.** A global 50 MB request limit silently overrode the 100 MB photo, 200 MB document and 500 MB media caps. The yt-dlp size cap was passed in the wrong unit and never applied. [documents-images, media-voice, product-ux]
- **Check native dependencies by running them, not by looking for the package.** Prebuilt sharp could read HEIC metadata but couldn't decode iPhone HEVC images, so those photos were never converted or analysed. ffmpeg and yt-dlp were missing from the image, while ImageMagick and Ghostscript were installed but unused. [documents-images, media-voice]

**Processing correctness**

- **Never encode status as user data.** `extraction-failed` tags replaced the user's tags, and fallback text extraction was computed but not saved. [documents-images]
- **Classify errors by type, not by searching the message text.** Timeout messages such as "…35000ms" contained "500", were counted as server errors, and could block a whole domain for an hour. [web-capture]
- **Carry timestamps through every transcript tier.** None of v0.7's caption, subtitle or STT paths preserved them. [media-voice]
- **Compute derived values; don't make them up.** "Dominant colours" were names invented by the vision model, and barcodes were "read" by an LLM instead of a decoder. [documents-images]

**Content and formats**

- **Use the real content type of external bytes**, from magic bytes or what the server actually returned, not the requested format. pocket-tts and ElevenLabs PCM were labelled as other formats. [media-voice]
- **Site APIs change; build in graceful fallback.** Reddit ended self-service API access (late 2025). X is pay-per-use, and long posts need `note_tweet`. YouTube downloads via yt-dlp now need a JS runtime. Every site handler must fall back to the generic web path. [web-capture, media-voice]

**Security**

- **SSRF protection must pin the validated IP** for the actual connection, and must cover every fetcher: the browser, yt-dlp and direct downloads. [web-capture, media-voice]

**State and lifecycle**

- **The state machine is the product.** In v0.7, recurring "handle" tasks stopped after one run, overdue flags never cleared, and rejecting a capture hard-deleted it. Model these as tested state machines (PRD §5.3, §5.8). [product-ux]
- **The upgrade gate must tell "DB unreachable" apart from "fresh install".** v0.7 could run first-time initialisation during a database outage. Keep the sleep-instead-of-crash-loop behaviour. [product-ux]

**CLI**

- **`--json` output must be pure JSON with meaningful exit codes**, because agents and scripts depend on it (PRD [INTEROP-1a]). [product-ux]

**Agents and models**

- **Hand external harnesses the full context.** v0.7 sent Claude Code, Codex and OpenCode only the last user message: no system prompt, no history, no resume, and no Eclaire tools. PRD [INTEROP-2] exists because of this. [ai-models-agents]
- **Test provider translation with parallel tool calls and malformed arguments.** The Anthropic path assigned every tool call the same index, which merged their arguments, and it silently replaced invalid JSON with `{}`. [ai-models-agents]
- **Keep auth-header handling in one place.** Keys stored as `Bearer <key>` got prefixed a second time. [ai-models-agents]
- **Re-verify harness protocols at build time.** The Codex app-server approval protocol has changed since v0.7 was written. [ai-models-agents]

## Pi integration: current state as found (Nov 2026, re-verify when building)

Details are in [ai-models-agents.md](./ai-models-agents.md).

- **Package:** `@earendil-works/pi-coding-agent`.
- **Modes:** interactive, print/JSON, **RPC** (`pi --mode rpc`, JSON lines over stdin/stdout) and an embeddable **SDK** (`AgentSession`, which the docs recommend for Node hosts).
- **Extensibility:** TypeScript extensions and npm/git "Pi packages". Extensions use `registerTool`, and a `tool_call` event can block a call, which gives Eclaire a hook for its approval policy.
- **Skills:** supported.
- **MCP:** available through the extension API and a built-in MCP extension. This conflicts with Pi's older "no MCP in core" stance, so confirm it.
- **Permissions:** no built-in permission system.
- **Suggested integration:** a Pi package bundling the Eclaire skill, plus an extension that registers Eclaire's MCP server or CLI-backed tools, with a `tool_call` gate that calls Eclaire's approval API.
