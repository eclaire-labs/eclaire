import { discoverSkills } from "@eclaire/ai";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { backendTools } from "../agent/tools/index.js";
import type { AgentCatalogItem, AgentDefinition } from "../agent/types.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { createChildLogger } from "../logger.js";
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
}

export interface UpdateAgentInput {
  name?: string;
  description?: string | null;
  systemPrompt?: string;
  toolNames?: string[];
  skillNames?: string[];
}

function listToolCatalog(): AgentCatalogItem[] {
  return Object.values(backendTools)
    .map((tool) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description,
    }))
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

function validateAgentCapabilities(input: {
  toolNames?: string[];
  skillNames?: string[];
}): void {
  const availableTools = new Set(Object.keys(backendTools));
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
    toolNames: Object.keys(backendTools),
    skillNames: discoverSkills().map((skill) => skill.name),
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
  validateAgentCapabilities(input);

  const trimmedName = input.name.trim();

  const [agent] = await db
    .insert(agents)
    .values({
      userId,
      name: trimmedName,
      description: input.description?.trim() || null,
      systemPrompt: input.systemPrompt.trim(),
      toolNames: input.toolNames ?? [],
      skillNames: input.skillNames ?? [],
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

  validateAgentCapabilities(updates);

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
      ...(updates.toolNames !== undefined
        ? { toolNames: updates.toolNames }
        : {}),
      ...(updates.skillNames !== undefined
        ? { skillNames: updates.skillNames }
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
