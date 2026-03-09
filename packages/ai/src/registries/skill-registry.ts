/**
 * Skill Registry
 *
 * Manages skill sources and provides discovery, lookup, and
 * prompt formatting for skills.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type {
  Skill,
  SkillFrontmatter,
  SkillScope,
  SkillSource,
} from "../runtime/skills/types.js";

// =============================================================================
// CONSTANTS
// =============================================================================

const SKILL_FILENAME = "SKILL.md";
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 512;

// =============================================================================
// FRONTMATTER PARSING
// =============================================================================

/**
 * Parse YAML frontmatter from markdown content.
 * Expects content starting with "---\n" and ending with "\n---\n".
 */
function parseFrontmatter(content: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  if (!content.startsWith("---")) {
    return { frontmatter: {}, body: content };
  }

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const yamlBlock = content.slice(4, endIndex).trim();
  const frontmatter: SkillFrontmatter = {};

  for (const line of yamlBlock.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    let value: string | boolean | string[] = line.slice(colonIndex + 1).trim();

    // Handle booleans
    if (value === "true") value = true;
    else if (value === "false") value = false;

    // Handle simple arrays (tags: [a, b, c])
    if (
      typeof value === "string" &&
      value.startsWith("[") &&
      value.endsWith("]")
    ) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    frontmatter[key] = value;
  }

  const body = content.slice(endIndex + 4).trim();
  return { frontmatter, body };
}

// =============================================================================
// REGISTRY
// =============================================================================

const sources: SkillSource[] = [];
let cachedSkills: Skill[] | null = null;

/**
 * Register a directory as a skill source.
 */
export function registerSkillSource(dir: string, scope: SkillScope): void {
  // Avoid duplicates
  if (sources.some((s) => s.dir === dir)) return;
  sources.push({ dir, scope });
  cachedSkills = null; // Invalidate cache
}

/**
 * Discover all skills from registered sources.
 * Results are cached until a new source is registered.
 */
export function discoverSkills(): Skill[] {
  if (cachedSkills) return cachedSkills;

  const skills: Skill[] = [];

  for (const source of sources) {
    if (!existsSync(source.dir)) continue;

    try {
      const entries = readdirSync(source.dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillFile = join(source.dir, entry.name, SKILL_FILENAME);
        if (!existsSync(skillFile)) continue;

        const skill = loadSkillFile(skillFile, source);
        if (skill) skills.push(skill);
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  cachedSkills = skills;
  return skills;
}

/**
 * Load and validate a single skill file.
 */
function loadSkillFile(filePath: string, source: SkillSource): Skill | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const { frontmatter } = parseFrontmatter(content);
    const parentDir = basename(dirname(filePath));

    const name =
      typeof frontmatter.name === "string" ? frontmatter.name : parentDir;

    // Validate
    if (name.length > MAX_NAME_LENGTH) return null;
    if (name !== parentDir) return null; // Name must match directory

    const description =
      typeof frontmatter.description === "string"
        ? frontmatter.description.slice(0, MAX_DESCRIPTION_LENGTH)
        : "";

    if (!description) return null; // Description required

    return {
      name,
      description,
      filePath,
      baseDir: source.dir,
      scope: source.scope,
      alwaysInclude: frontmatter.alwaysInclude === true,
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Get a skill by name.
 */
export function getSkill(name: string): Skill | undefined {
  return discoverSkills().find((s) => s.name === name);
}

/**
 * Get a summary of all skills for injection into the system prompt.
 * Returns a formatted string listing all available skills.
 */
export function getSkillSummary(): string {
  const skills = discoverSkills();
  if (skills.length === 0) return "";

  const lines = skills.map((s) => `- ${s.name}: ${s.description}`);
  return `Available skills:\n${lines.join("\n")}`;
}

/**
 * Load the full content of a skill (body without frontmatter).
 */
export function loadSkillContent(name: string): string | undefined {
  const skill = getSkill(name);
  if (!skill) return undefined;

  try {
    const content = readFileSync(skill.filePath, "utf-8");
    const { body } = parseFrontmatter(content);
    return body;
  } catch {
    return undefined;
  }
}

/**
 * Get all skills marked as alwaysInclude.
 */
export function getAlwaysIncludeSkills(): Skill[] {
  return discoverSkills().filter((s) => s.alwaysInclude);
}

/**
 * Invalidate the skill cache (e.g., after file changes).
 */
export function invalidateSkillCache(): void {
  cachedSkills = null;
}

/**
 * Clear all sources and cached skills (for testing).
 */
export function clearSkillSources(): void {
  sources.length = 0;
  cachedSkills = null;
}
