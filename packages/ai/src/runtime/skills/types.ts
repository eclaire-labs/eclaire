/**
 * Skill Types
 *
 * Skills are markdown files with YAML frontmatter that provide
 * reusable instructions and context for the AI.
 */

// =============================================================================
// SKILL DEFINITION
// =============================================================================

/** Parsed skill from a markdown file */
export interface Skill {
  /** Unique skill name (from frontmatter or directory name) */
  name: string;

  /** Short description for the skill index in system prompt */
  description: string;

  /** Absolute path to the skill file */
  filePath: string;

  /** Base directory the skill was discovered from */
  baseDir: string;

  /** Scope of the skill source */
  scope: SkillScope;

  /** Whether to always include full content in system prompt */
  alwaysInclude: boolean;

  /** Optional tags for categorization */
  tags?: string[];
}

/** Where a skill was discovered from */
export type SkillScope = "workspace" | "user" | "admin";

/** Frontmatter parsed from a skill markdown file */
export interface SkillFrontmatter {
  name?: string;
  description?: string;
  alwaysInclude?: boolean;
  tags?: string[];
  [key: string]: unknown;
}

// =============================================================================
// SKILL SOURCE
// =============================================================================

/** A directory to scan for skills */
export interface SkillSource {
  /** Absolute path to the skills directory */
  dir: string;

  /** Scope of skills found in this directory */
  scope: SkillScope;
}
