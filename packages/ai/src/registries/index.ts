/**
 * Registry Exports
 *
 * Central exports for all registries.
 */

export {
  registerProvider,
  getProvider,
  getAdapterByDialect,
  listProviders,
  unregisterProvider,
  hasProvider,
  clearProviders,
  type ProviderRegistration,
} from "./provider-registry.js";

export {
  registerTool,
  getTool,
  getToolDefinition,
  getActiveTools,
  setActiveTools,
  listTools,
  unregisterTool,
  hasTool,
  getPromptContributions,
  clearTools,
} from "./tool-registry.js";

export {
  registerSkillSource,
  discoverSkills,
  getSkill,
  getSkillSummary,
  loadSkillContent,
  getAlwaysIncludeSkills,
  invalidateSkillCache,
  clearSkillSources,
} from "./skill-registry.js";
