# Eclaire v1: instructions for agents

## Status

Eclaire is being rebuilt from the ground up. **There is no application code yet.**

The current phase is the **Phase 0 design pass** (see `docs/PRD.md` §11), which produces:

- `docs/architecture.md`
- `docs/adr/`: one ADR per decision D1–D19 in PRD §13
- `docs/specs/`: the core contracts
- `docs/plan/phase-0.md`: milestones and spikes

**UX design ([UX-0])** runs in parallel and writes to `docs/design/`.

## Sources of truth, in priority order

1. **`docs/PRD.md`**: the requirements, including Appendix C.
   - The §12 decision log is **fixed**.
   - The §13 technology recommendations may be challenged with evidence, in an ADR.
2. **`docs/specs/` and `docs/adr/`**, once they exist: contracts and decisions.
   - Follow specs exactly.
   - If a spec is wrong or incomplete, stop and propose a change. Never work around a spec.
3. **`docs/design/`**, once it exists: the output of the UX design step.

Background only, not requirements:

- **`docs/REVIEW.md`**: lessons from v0.7. The v0.7 code it cites is **not available** and must not be recreated.
- **`docs/reference/`**: notes extracted from v0.7. Follow the reading rules in `docs/reference/README.md`:
  - Never read these notes during architecture, spec or UX design work.
  - When implementing a specific processor, source, channel, provider or harness integration, read only that topic.
  - Bullets labelled `[v0.7 choice]` and the "v0.7 UI inventory" appendix are not requirements.

## Hard rules

- **No v0 code or structure.**
  - Do not look at git history before the commit "Start Eclaire v1 rebuild".
  - Do not fetch v0 code from GitHub or elsewhere.
- **Kind lists come only from the kind registry** ([KIND-2]). Never hard-code a list of kinds.
- **Config:** only the config module reads environment variables or config files ([CFG-1]).
- **Contracts are schemas.**
  - No `any` at API or protocol boundaries.
  - Clients are generated, never handwritten ([API-4], [CLIENT-2]).
- **Permissions:**
  - Every route and every tool declares its permissions.
  - The policy engine runs on every path ([AUTHZ-1], [AUTHZ-2]).
  - **No authentication bypass of any kind**: not by network location, headers, environment or mode ([AUTH-7]).
- **Durable state:** nothing user-visible lives only in memory ([PRIN-4]).
- **Humans win:** AI output never overwrites values the user set ([PROC-8]).
- **Privacy:** no user content in logs ([OBS-1]).
- **One behaviour everywhere:** the same behaviour in every deployment topology ([PRIN-7]).
- **Standard protocols:** prefer standard protocols to bespoke ones ([PRIN-3]). Any new protocol needs an ADR.

## Working conventions

- **Traceability:** tie all work to PRD IDs. Commits, PRs and tests reference them, e.g. `[SRC-4]`, `RULE-WEB-11`.
- **ADRs:** use `docs/adr/NNNN-short-title.md` with sections for context, options, decision, consequences, and "revisit when".
- **Tests first** for contracts and state machines. Every extension contract gets a conformance kit ([EXT-4]). Every Appendix C rule gets at least one test.
- **One reviewable PR per milestone.**
- **When the PRD is ambiguous or wrong,** stop and propose a PRD edit or an ADR. Never silently diverge.
- **The docs date from November 2026.** Verify library versions, external APIs and model choices when you build.

## Commands

None yet. Phase 0 sets up the tooling (PRD §13 D15). Add the lint, format, typecheck and test commands here as soon as they exist.
