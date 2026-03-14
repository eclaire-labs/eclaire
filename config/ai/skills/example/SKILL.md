---
name: example
description: Example skill demonstrating the skill format. Skills are instruction packages that teach the agent how to handle specific tasks using its existing tools.
alwaysInclude: false
tags: [example, reference]
---

# Example Skill

This is an example skill file. Skills provide specialized instructions that the agent loads on-demand when the task matches the skill's description.

## How Skills Work

1. The agent sees a list of available skills (name + description) in its system prompt
2. When a task matches a skill's description, the agent loads the full skill content using the `loadSkill` tool
3. The skill content provides domain-specific instructions for using the agent's existing tools

## Writing a Skill

Create a directory under `config/ai/skills/` with a `SKILL.md` file:

```
config/ai/skills/
  my-skill/
    SKILL.md
```

The `SKILL.md` file must have YAML frontmatter with:
- `name` — must match the directory name
- `description` — short summary (max 512 chars) used in the skill index
- `alwaysInclude` — set to `true` to always inject full content into the system prompt
- `tags` — optional categorization tags

The markdown body contains the actual instructions the agent will follow.
