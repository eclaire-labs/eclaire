/**
 * Backend Agent Types
 */

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
}

export type AgentKind = "builtin" | "custom";

export interface AgentDefinition {
  id: string;
  kind: AgentKind;
  name: string;
  description: string | null;
  systemPrompt: string;
  toolNames: string[];
  skillNames: string[];
  isEditable: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AgentCatalogItem {
  name: string;
  label: string;
  description: string;
  availability?: "available" | "setup_required" | "disabled";
  availabilityReason?: string;
}
