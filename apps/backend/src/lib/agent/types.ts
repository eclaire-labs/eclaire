/**
 * Backend Agent Types
 */

import type { AgentDefinitionBase } from "@eclaire/ai";

export type { AgentKind } from "@eclaire/ai";

/**
 * User profile context for personalization
 */
export interface UserContext {
  displayName: string | null;
  fullName: string | null;
  bio: string | null;
  timezone: string | null;
  city: string | null;
  country: string | null;
  isInstanceAdmin: boolean;
}

export interface AgentDefinition extends AgentDefinitionBase {
  isEditable: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AgentCatalogItem {
  name: string;
  label: string;
  description: string;
  accessLevel?: "read" | "write";
  availability?: "available" | "setup_required" | "disabled";
  availabilityReason?: string;
  parameters?: Record<string, unknown>;
  visibility?: "backend" | "cli" | "all";
  needsApproval?: boolean;
}
