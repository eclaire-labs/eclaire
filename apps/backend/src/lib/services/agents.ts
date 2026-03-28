import {
  discoverSkills,
  getAgentRuntimeKindForModel,
  getModelConfigById,
  getSkill,
  isValidModelIdFormat,
  loadSkillContent,
  resolveProviderForModel,
} from "@eclaire/ai";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { getBackendTools } from "../agent/tools/index.js";
import type { AgentCatalogItem, AgentDefinition } from "../agent/types.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import { recordHistory } from "./history.js";
import type { CallerContext } from "./types.js";
import { getMcpRegistry } from "../mcp/index.js";
import {
  normalizeCreateAgentCapabilities,
  normalizeUpdatedAgentCapabilities,
} from "./agent-capabilities.js";
import { DEFAULT_AGENT_ACTOR_ID } from "./actor-constants.js";
import { updateAgentActorDisplayName } from "./actors.js";

const { agents } = schema;

const logger = createChildLogger("services:agents");

export const DEFAULT_AGENT_ID = DEFAULT_AGENT_ACTOR_ID;

/**
 * Tools excluded from the default agent unless the user explicitly enables them.
 * Browser tools are disabled by default because autonomous web browsing can be
 * dangerous (exfiltration, unintended actions) and unreliable.
 */
const TOOLS_DISABLED_BY_DEFAULT = new Set(["browseWeb", "browseChrome"]);

const DEFAULT_AGENT_SYSTEM_PROMPT = [
  "You are Eclaire, the user's general-purpose AI teammate.",
  "Be practical, accurate, and direct.",
  "Prefer using tools when they can improve accuracy or act on the user's behalf.",
].join(" ");

export interface SkillCatalogItem {
  name: string;
  description: string;
  scope: "workspace" | "user" | "admin";
  alwaysInclude: boolean;
  tags: string[];
}

export interface SkillDetailItem extends SkillCatalogItem {
  content: string;
}

export interface AgentCatalog {
  tools: AgentCatalogItem[];
  skills: SkillCatalogItem[];
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

function serializeToolParameters(
  tool: ReturnType<typeof getBackendTools>[string],
): Record<string, unknown> | undefined {
  try {
    return (tool.__rawJsonSchema ?? z.toJSONSchema(tool.inputSchema)) as Record<
      string,
      unknown
    >;
  } catch {
    return undefined;
  }
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
        accessLevel: tool.accessLevel ?? "write",
        parameters: serializeToolParameters(tool),
        visibility: tool.visibility ?? "all",
        needsApproval:
          typeof tool.needsApproval === "function"
            ? true
            : (tool.needsApproval ?? false),
        ...mcpAvailability,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function listSkillCatalog(): SkillCatalogItem[] {
  return discoverSkills()
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      scope: skill.scope,
      alwaysInclude: skill.alwaysInclude,
      tags: skill.tags ?? [],
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
  return {
    id: record.id,
    kind: "custom",
    name: record.name,
    description: record.description,
    systemPrompt: record.systemPrompt,
    toolNames: Array.isArray(record.toolNames) ? record.toolNames : [],
    skillNames: Array.isArray(record.skillNames) ? record.skillNames : [],
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
    toolNames: Object.keys(getBackendTools()).filter(
      (name) => !TOOLS_DISABLED_BY_DEFAULT.has(name),
    ),
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

export function getSkillDetail(name: string): SkillDetailItem {
  const skill = getSkill(name);
  if (!skill) {
    throw new NotFoundError(`Skill "${name}" not found`);
  }

  const content = loadSkillContent(name) ?? "";
  const catalogItem = listSkillCatalog().find((s) => s.name === name);

  return {
    name: skill.name,
    description: skill.description,
    scope: skill.scope,
    alwaysInclude: skill.alwaysInclude,
    tags: catalogItem?.tags ?? skill.tags ?? [],
    content,
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
  caller?: CallerContext,
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

  // Atomic: create agent + actor in a single transaction to prevent orphaned rows
  const agent = await db.transaction(async (tx) => {
    const [inserted] = await tx
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

    if (!inserted) {
      throw new Error("Failed to create agent");
    }

    await tx
      .insert(schema.actors)
      .values({
        id: inserted.id,
        ownerUserId: userId,
        kind: "agent" as const,
        displayName: trimmedName,
      })
      .onConflictDoUpdate({
        target: schema.actors.id,
        set: {
          ownerUserId: userId,
          kind: "agent" as const,
          displayName: trimmedName,
          updatedAt: new Date(),
        },
      });

    return inserted;
  });

  logger.info({ userId, agentId: agent.id }, "Created custom agent");

  if (caller) {
    await recordHistory({
      action: "create",
      itemType: "agent",
      itemId: agent.id,
      itemName: trimmedName,
      beforeData: null,
      afterData: {
        name: trimmedName,
        description: input.description,
        modelId: input.modelId,
        toolNames: capabilities.toolNames,
        skillNames: capabilities.skillNames,
      },
      actor: caller.actor,
      actorId: caller.actorId,
      authorizedByActorId: caller.authorizedByActorId ?? null,
      grantId: caller.grantId ?? null,
      userId: caller.ownerUserId,
    });
  }

  return normalizeAgentRecord(agent);
}

export async function updateAgent(
  userId: string,
  agentId: string,
  updates: UpdateAgentInput,
  caller?: CallerContext,
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

  if (caller) {
    const normalizedUpdated = normalizeAgentRecord(updated);
    await recordHistory({
      action: "update",
      itemType: "agent",
      itemId: agentId,
      itemName: normalizedUpdated.name,
      beforeData: {
        name: existingAgent.name,
        description: existingAgent.description,
        modelId: existingAgent.modelId,
      },
      afterData: {
        name: normalizedUpdated.name,
        description: normalizedUpdated.description,
        modelId: normalizedUpdated.modelId,
      },
      actor: caller.actor,
      actorId: caller.actorId,
      authorizedByActorId: caller.authorizedByActorId ?? null,
      grantId: caller.grantId ?? null,
      userId: caller.ownerUserId,
    });
    return normalizedUpdated;
  }

  return normalizeAgentRecord(updated);
}

export async function deleteAgent(
  userId: string,
  agentId: string,
  caller?: CallerContext,
): Promise<void> {
  if (agentId === DEFAULT_AGENT_ID) {
    throw new ValidationError("The default Eclaire agent cannot be deleted");
  }

  // Atomic: delete agent + actor in a single transaction to prevent orphaned rows
  const deleted = await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(agents)
      .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
      .returning();

    if (!removed) {
      throw new NotFoundError("Agent", agentId);
    }

    await tx
      .delete(schema.actors)
      .where(
        and(
          eq(schema.actors.id, agentId),
          eq(schema.actors.ownerUserId, userId),
          eq(schema.actors.kind, "agent"),
        ),
      );

    return removed;
  });

  logger.info({ userId, agentId }, "Deleted custom agent");

  if (caller) {
    await recordHistory({
      action: "delete",
      itemType: "agent",
      itemId: agentId,
      itemName: deleted.name,
      beforeData: {
        name: deleted.name,
        description: deleted.description,
        modelId: deleted.modelId,
      },
      afterData: null,
      actor: caller.actor,
      actorId: caller.actorId,
      authorizedByActorId: caller.authorizedByActorId ?? null,
      grantId: caller.grantId ?? null,
      userId: caller.ownerUserId,
    });
  }
}
