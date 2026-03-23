export interface Agent {
  id: string;
  kind: "builtin" | "custom";
  name: string;
  description: string | null;
  systemPrompt: string;
  toolNames: string[];
  skillNames: string[];
  modelId?: string | null;
  isEditable: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface AgentCatalogItem {
  name: string;
  label?: string;
  description: string;
  availability?: "available" | "setup_required" | "disabled";
  availabilityReason?: string;
}

export interface SkillCatalogItem {
  name: string;
  description: string;
  scope: "workspace" | "user" | "admin";
  alwaysInclude: boolean;
  tags: string[];
}

export interface AgentCatalog {
  tools: AgentCatalogItem[];
  skills: SkillCatalogItem[];
}
