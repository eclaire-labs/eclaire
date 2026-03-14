# Browser-Capable Custom Agent

This setup adds a safe, read-only browser tool backed by the local `agent-browser` CLI.

## Requirements

- `agent-browser` must be installed on the same machine as the Eclaire backend.
- Run `agent-browser install` at least once so the browser binary is available.
- Restart the backend after changing skill directories or environment variables.

## Skill Discovery

The backend now discovers skills from:

- `config/ai/skills`
- `AI_SKILLS_DIR`
- `~/.agents/skills` when running in local runtime and the directory exists
- `AI_USER_SKILLS_DIRS` for extra local user skill directories

`AI_USER_SKILLS_DIRS` accepts a comma-separated or newline-separated list of absolute paths.

Example:

```bash
export AI_USER_SKILLS_DIRS="/Users/antoine/.agents/skills,/Users/antoine/team-skills"
```

## Create The Agent Programmatically

Use the existing `POST /api/agents` endpoint.

Example payload:

```json
{
  "name": "Browser Researcher",
  "description": "Researches public websites using the safe browser tool.",
  "systemPrompt": "You are Browser Researcher, a focused agent for public web research. Use browseWeb to inspect current websites, summarize findings clearly, and avoid interactive or authenticated actions. Load the agent-browser skill when you need the detailed browser workflow.",
  "toolNames": ["browseWeb", "loadSkill"],
  "skillNames": ["agent-browser"]
}
```

Notes:

- `loadSkill` is automatically added by the backend whenever an agent has enabled skills.
- The frontend also locks `loadSkill` on when at least one skill is selected.

## Try It Out

1. Start the backend locally with `agent-browser` installed.
2. Create the `Browser Researcher` agent in the UI or via `POST /api/agents`.
3. Open a chat with that agent and try:

```text
Open https://example.com, inspect the page, and summarize what it is for.
```

```text
Take a screenshot of https://example.com and tell me where it was saved.
```

## v1 Safety Limits

The `browseWeb` tool is intentionally read-only in this version:

- Allowed: `open`, `snapshot`, `wait`, `get`, `screenshot`, `close`
- Blocked: clicks, fills, logins, downloads, file URLs, localhost URLs, and private-network URLs

This is intended for public-web research, not general browser automation.
