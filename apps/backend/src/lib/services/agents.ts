import {
  discoverSkills,
  getAgentRuntimeKindForModel,
  getModelConfigById,
  isValidModelIdFormat,
  resolveProviderForModel,
} from "@eclaire/ai";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { getBackendTools } from "../agent/tools/index.js";
import type { AgentCatalogItem, AgentDefinition } from "../agent/types.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import { getMcpRegistry } from "../mcp/index.js";
import {
  normalizeCreateAgentCapabilities,
  normalizeUpdatedAgentCapabilities,
} from "./agent-capabilities.js";
import { DEFAULT_AGENT_ACTOR_ID } from "./actor-constants.js";
import {
  createAgentActor,
  deleteAgentActor,
  updateAgentActorDisplayName,
} from "./actors.js";

const { agents } = schema;

const logger = createChildLogger("services:agents");

export const DEFAULT_AGENT_ID = DEFAULT_AGENT_ACTOR_ID;

const DEFAULT_AGENT_SYSTEM_PROMPT = [
  "You are Eclaire, the user's general-purpose AI teammate.",
  "Be practical, accurate, and direct.",
  "Prefer using tools when they can improve accuracy or act on the user's behalf.",
].join(" ");

export interface AgentCatalog {
  tools: AgentCatalogItem[];
  skills: Array<Pick<AgentCatalogItem, "name" | "description">>;
}

export interface CreateAgentInput {
  name: string;
  description?: string | null;
  systemPrompt: string;
  toolNames?: string[];
  skillNames?: string[];
  modelId?: string | null;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string | null;
  systemPrompt?: string;
  toolNames?: string[];
  skillNames?: string[];
  modelId?: string | null;
}

function listToolCatalog(): AgentCatalogItem[] {
  const allTools = getBackendTools();
  let registry: ReturnType<typeof getMcpRegistry> | null = null;
  try {
    registry = getMcpRegistry();
  } catch {
    // Registry not initialized yet
  }

  return Object.values(allTools)
    .map((tool) => {
      const mcpAvailability = registry?.getToolAvailability(tool.name);
      return {
        name: tool.name,
        label: tool.label,
        description: tool.description,
        ...mcpAvailability,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function listSkillCatalog(): AgentCatalog["skills"] {
  return discoverSkills()
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function validateAgentModelId(modelId: string | null | undefined): void {
  if (!modelId) return;

  if (!isValidModelIdFormat(modelId)) {
    throw new ValidationError(
      `Invalid model ID format: "${modelId}". Expected "provider:model"`,
      "modelId",
    );
  }

  const modelConfig = getModelConfigById(modelId);
  if (!modelConfig) {
    throw new ValidationError(
      `Model "${modelId}" not found in system configuration`,
      "modelId",
    );
  }

  try {
    resolveProviderForModel(modelId, modelConfig);
  } catch {
    throw new ValidationError(
      `Model "${modelId}" has an invalid provider configuration`,
      "modelId",
    );
  }
}

function validateAgentCapabilities(input: {
  toolNames?: string[];
  skillNames?: string[];
}): void {
  const availableTools = new Set(Object.keys(getBackendTools()));
  const availableSkills = new Set(discoverSkills().map((skill) => skill.name));

  for (const toolName of input.toolNames ?? []) {
    if (!availableTools.has(toolName)) {
      throw new ValidationError(`Unknown tool: ${toolName}`, "toolNames");
    }
  }

  for (const skillName of input.skillNames ?? []) {
    if (!availableSkills.has(skillName)) {
      throw new ValidationError(`Unknown skill: ${skillName}`, "skillNames");
    }
  }
}

function validateRuntimeCapabilityPolicy(
  modelId: string | null | undefined,
  toolNames: string[],
  skillNames: string[],
): void {
  if (!modelId) return;

  const runtimeKind = getAgentRuntimeKindForModel(modelId);
  if (runtimeKind !== "external_harness") return;

  if (toolNames.length > 0) {
    throw new ValidationError(
      "External harness models do not support Eclaire tools. Remove toolNames or choose a native model.",
      "toolNames",
    );
  }
  if (skillNames.length > 0) {
    throw new ValidationError(
      "External harness models do not support Eclaire skills. Remove skillNames or choose a native model.",
      "skillNames",
    );
  }
}

function normalizeAgentRecord(
  record: typeof agents.$inferSelect,
): AgentDefinition {
  let toolNames = Array.isArray(record.toolNames) ? record.toolNames : [];
  let skillNames = Array.isArray(record.skillNames) ? record.skillNames : [];

  // Sanitize capabilities for external harness models (handles pre-existing data)
  if (record.modelId) {
    const runtimeKind = getAgentRuntimeKindForModel(record.modelId);
    if (runtimeKind === "external_harness") {
      if (toolNames.length > 0 || skillNames.length > 0) {
        logger.warn(
          { agentId: record.id, modelId: record.modelId },
          "Sanitizing tools/skills for external harness agent on read",
        );
        toolNames = [];
        skillNames = [];
      }
    }
  }

  return {
    id: record.id,
    kind: "custom",
    name: record.name,
    description: record.description,
    systemPrompt: record.systemPrompt,
    toolNames,
    skillNames,
    modelId: record.modelId ?? null,
    isEditable: true,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function getDefaultAgentDefinition(): AgentDefinition {
  return {
    id: DEFAULT_AGENT_ID,
    kind: "builtin",
    name: "Eclaire",
    description: "Default general-purpose assistant for your workspace.",
    systemPrompt: DEFAULT_AGENT_SYSTEM_PROMPT,
    toolNames: Object.keys(getBackendTools()),
    skillNames: discoverSkills().map((skill) => skill.name),
    modelId: null,
    isEditable: false,
  };
}

export function getAgentCatalog(): AgentCatalog {
  return {
    tools: listToolCatalog(),
    skills: listSkillCatalog(),
  };
}

export async function listAgents(userId: string): Promise<AgentDefinition[]> {
  const customAgents = await db
    .select()
    .from(agents)
    .where(eq(agents.userId, userId))
    .orderBy(desc(agents.updatedAt), desc(agents.createdAt));

  return [
    getDefaultAgentDefinition(),
    ...customAgents.map(normalizeAgentRecord),
  ];
}

export async function getAgent(
  userId: string,
  agentId: string,
): Promise<AgentDefinition> {
  if (agentId === DEFAULT_AGENT_ID) {
    return getDefaultAgentDefinition();
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)));

  if (!agent) {
    throw new NotFoundError("Agent", agentId);
  }

  return normalizeAgentRecord(agent);
}

export async function createAgent(
  userId: string,
  input: CreateAgentInput,
): Promise<AgentDefinition> {
  const capabilities = normalizeCreateAgentCapabilities(input);
  validateAgentCapabilities(capabilities);
  validateAgentModelId(input.modelId);
  validateRuntimeCapabilityPolicy(
    input.modelId,
    capabilities.toolNames,
    capabilities.skillNames,
  );

  const trimmedName = input.name.trim();

  const [agent] = await db
    .insert(agents)
    .values({
      userId,
      name: trimmedName,
      description: input.description?.trim() || null,
      systemPrompt: input.systemPrompt.trim(),
      toolNames: capabilities.toolNames,
      skillNames: capabilities.skillNames,
      modelId: input.modelId ?? null,
    })
    .returning();

  if (!agent) {
    throw new Error("Failed to create agent");
  }

  await createAgentActor(userId, agent.id, trimmedName);

  logger.info({ userId, agentId: agent.id }, "Created custom agent");
  return normalizeAgentRecord(agent);
}

export async function updateAgent(
  userId: string,
  agentId: string,
  updates: UpdateAgentInput,
): Promise<AgentDefinition> {
  if (agentId === DEFAULT_AGENT_ID) {
    throw new ValidationError("The default Eclaire agent is read-only");
  }

  const existingAgent = await getAgent(userId, agentId);
  const capabilityUpdates = normalizeUpdatedAgentCapabilities(existingAgent, {
    toolNames: updates.toolNames,
    skillNames: updates.skillNames,
  });
  validateAgentCapabilities({
    toolNames: capabilityUpdates.toolNames,
    skillNames: capabilityUpdates.skillNames ?? existingAgent.skillNames,
  });
  if (updates.modelId !== undefined) {
    validateAgentModelId(updates.modelId);
  }

  // Validate runtime capability policy against the effective modelId
  const effectiveModelId =
    updates.modelId !== undefined ? updates.modelId : existingAgent.modelId;
  const effectiveToolNames =
    capabilityUpdates.toolNames ?? existingAgent.toolNames;
  const effectiveSkillNames =
    capabilityUpdates.skillNames ?? existingAgent.skillNames;
  validateRuntimeCapabilityPolicy(
    effectiveModelId,
    effectiveToolNames,
    effectiveSkillNames,
  );

  const trimmedName = updates.name?.trim();

  const [updated] = await db
    .update(agents)
    .set({
      ...(trimmedName !== undefined ? { name: trimmedName } : {}),
      ...(updates.description !== undefined
        ? { description: updates.description?.trim() || null }
        : {}),
      ...(updates.systemPrompt !== undefined
        ? { systemPrompt: updates.systemPrompt.trim() }
        : {}),
      ...(capabilityUpdates.toolNames !== undefined
        ? { toolNames: capabilityUpdates.toolNames }
        : {}),
      ...(capabilityUpdates.skillNames !== undefined
        ? { skillNames: capabilityUpdates.skillNames }
        : {}),
      ...(updates.modelId !== undefined
        ? { modelId: updates.modelId ?? null }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .returning();

  if (!updated) {
    throw new NotFoundError("Agent", agentId);
  }

  if (trimmedName !== undefined) {
    await updateAgentActorDisplayName(userId, agentId, trimmedName);
  }

  logger.info({ userId, agentId }, "Updated custom agent");
  return normalizeAgentRecord(updated);
}

export async function deleteAgent(
  userId: string,
  agentId: string,
): Promise<void> {
  if (agentId === DEFAULT_AGENT_ID) {
    throw new ValidationError("The default Eclaire agent cannot be deleted");
  }

  const [deleted] = await db
    .delete(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .returning();

  if (!deleted) {
    throw new NotFoundError("Agent", agentId);
  }

  await deleteAgentActor(userId, agentId);

  logger.info({ userId, agentId }, "Deleted custom agent");
}
