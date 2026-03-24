import type {
  ActorKind,
  ApiKeyScope,
  ApiKeyScopeCatalogItem,
} from "@eclaire/api-types";
import { ForbiddenError } from "./errors.js";

export type AuthMethod = "session" | "api_key" | "localhost";

export interface AuthPrincipal {
  actorId: string;
  actorKind: ActorKind;
  ownerUserId: string;
  grantId: string | null;
  grantedByActorId: string | null;
  credentialId: string | null;
  authMethod: AuthMethod;
  scopes: ApiKeyScope[];
}

export const FULL_ACCESS_SCOPE: ApiKeyScope = "*";

export const API_KEY_SCOPE_CATALOG: ApiKeyScopeCatalogItem[] = [
  {
    scope: "profile:read",
    label: "Read profile",
    description: "Read profile, dashboard, and account-scoped metadata.",
  },
  {
    scope: "profile:write",
    label: "Write profile",
    description: "Update profile and avatar settings.",
  },
  {
    scope: "credentials:read",
    label: "Read credentials",
    description: "List API keys and available scope metadata.",
  },
  {
    scope: "credentials:write",
    label: "Manage credentials",
    description: "Create, rename, and revoke API keys.",
  },
  {
    scope: "actors:read",
    label: "Read actors",
    description: "List and inspect actors available in the workspace.",
  },
  {
    scope: "actors:write",
    label: "Write actors",
    description:
      "Create, update, and delete externally managed service actors.",
  },
  {
    scope: "assets:read",
    label: "Read assets",
    description: "Read bookmarks, documents, photos, notes, tags, and search.",
  },
  {
    scope: "assets:write",
    label: "Write assets",
    description:
      "Create, update, delete, and reprocess bookmarks, documents, photos, and notes.",
  },
  {
    scope: "tasks:read",
    label: "Read tasks",
    description: "Read tasks and task comments.",
  },
  {
    scope: "tasks:write",
    label: "Write tasks",
    description: "Create, update, comment on, and complete tasks.",
  },
  {
    scope: "channels:read",
    label: "Read channels",
    description: "Read channel integrations and channel configuration.",
  },
  {
    scope: "channels:write",
    label: "Write channels",
    description: "Create, update, delete, and test channel integrations.",
  },
  {
    scope: "agents:read",
    label: "Read agents",
    description: "Read builtin and custom agent definitions.",
  },
  {
    scope: "agents:write",
    label: "Write agents",
    description: "Create, update, and delete custom agents.",
  },
  {
    scope: "conversations:read",
    label: "Read conversations",
    description: "Read chat sessions, messages, and conversation state.",
  },
  {
    scope: "conversations:write",
    label: "Write conversations",
    description:
      "Create sessions, send messages, and mutate conversation state.",
  },
  {
    scope: "history:read",
    label: "Read history",
    description: "Read audit and history entries.",
  },
  {
    scope: "processing:read",
    label: "Read processing",
    description: "Read processing status and subscribe to processing events.",
  },
  {
    scope: "processing:write",
    label: "Write processing",
    description: "Retry and reprocess assets.",
  },
  {
    scope: "notifications:write",
    label: "Send notifications",
    description: "Send outbound notifications through configured channels.",
  },
  {
    scope: "feedback:read",
    label: "Read feedback",
    description: "Read submitted feedback entries.",
  },
  {
    scope: "feedback:write",
    label: "Write feedback",
    description: "Submit feedback entries.",
  },
  {
    scope: "model:read",
    label: "Read model config",
    description: "Read the currently active model configuration metadata.",
  },
  {
    scope: "admin:read",
    label: "Read admin config",
    description:
      "Read instance admin configuration: providers, models, MCP servers, settings, and users.",
  },
  {
    scope: "admin:write",
    label: "Write admin config",
    description:
      "Modify instance admin configuration and manage users (suspend, delete, role changes).",
  },
  {
    scope: "audio:read",
    label: "Read audio",
    description: "Read audio service health and transcription results.",
  },
  {
    scope: "audio:write",
    label: "Write audio",
    description: "Transcribe audio and synthesize speech.",
  },
];

const IMPLIED_SCOPE_MAP: Partial<Record<ApiKeyScope, ApiKeyScope[]>> = {
  "profile:write": ["profile:read"],
  "credentials:write": ["credentials:read"],
  "actors:write": ["actors:read"],
  "assets:write": ["assets:read"],
  "tasks:write": ["tasks:read"],
  "channels:write": ["channels:read"],
  "agents:write": ["agents:read"],
  "conversations:write": ["conversations:read"],
  "feedback:write": ["feedback:read"],
  "admin:write": ["admin:read"],
  "processing:write": ["processing:read"],
  "audio:write": ["audio:read"],
};

export function getApiKeyScopeCatalog(): ApiKeyScopeCatalogItem[] {
  return API_KEY_SCOPE_CATALOG;
}

export function normalizeGrantedScopes(
  scopes: ApiKeyScope[] | null | undefined,
): ApiKeyScope[] {
  const granted = new Set<ApiKeyScope>(
    scopes?.length ? scopes : [FULL_ACCESS_SCOPE],
  );

  if (granted.has(FULL_ACCESS_SCOPE)) {
    return [FULL_ACCESS_SCOPE];
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const scope of Array.from(granted)) {
      for (const impliedScope of IMPLIED_SCOPE_MAP[scope] ?? []) {
        if (!granted.has(impliedScope)) {
          granted.add(impliedScope);
          changed = true;
        }
      }
    }
  }

  return Array.from(granted);
}

export function principalHasScope(
  principal: AuthPrincipal,
  requiredScope: ApiKeyScope,
): boolean {
  if (principal.authMethod !== "api_key") {
    return true;
  }

  const grantedScopes = normalizeGrantedScopes(principal.scopes);
  return (
    grantedScopes.includes(FULL_ACCESS_SCOPE) ||
    grantedScopes.includes(requiredScope)
  );
}

export function assertPrincipalScopes(
  principal: AuthPrincipal,
  requiredScopes: ApiKeyScope[] | null | undefined,
): void {
  if (principal.authMethod !== "api_key") {
    return;
  }

  if (requiredScopes === null || requiredScopes === undefined) {
    throw new ForbiddenError(
      "API key access is not permitted for this endpoint",
    );
  }

  if (!requiredScopes.length) {
    return;
  }

  const hasAnyScope = requiredScopes.some((requiredScope) =>
    principalHasScope(principal, requiredScope),
  );

  if (!hasAnyScope) {
    throw new ForbiddenError("API key does not have the required scope");
  }
}

export function inferRequiredScopesForRequest(
  path: string,
  method: string,
): ApiKeyScope[] | null {
  const normalizedMethod = method.toUpperCase();

  if (path.startsWith("/api/admin")) {
    return normalizedMethod === "GET" ? ["admin:read"] : ["admin:write"];
  }

  if (path.startsWith("/api/user/api-keys")) {
    return normalizedMethod === "GET"
      ? ["credentials:read"]
      : ["credentials:write"];
  }

  if (path.startsWith("/api/actors/credential-scopes")) {
    return ["credentials:read"];
  }

  if (path.match(/^\/api\/actors\/[^/]+\/api-keys(\/[^/]+)?$/)) {
    return normalizedMethod === "GET"
      ? ["credentials:read"]
      : ["credentials:write"];
  }

  if (path.startsWith("/api/actors")) {
    return normalizedMethod === "GET" ? ["actors:read"] : ["actors:write"];
  }

  if (path.startsWith("/api/agents")) {
    return normalizedMethod === "GET" ? ["agents:read"] : ["agents:write"];
  }

  if (path.startsWith("/api/channels")) {
    return normalizedMethod === "GET" ? ["channels:read"] : ["channels:write"];
  }

  if (path.startsWith("/api/notifications")) {
    return ["notifications:write"];
  }

  if (path.startsWith("/api/tasks")) {
    return normalizedMethod === "GET" ? ["tasks:read"] : ["tasks:write"];
  }

  if (path.startsWith("/api/sessions")) {
    return normalizedMethod === "GET"
      ? ["conversations:read"]
      : ["conversations:write"];
  }

  if (path.startsWith("/api/history")) {
    return ["history:read"];
  }

  if (
    path.startsWith("/api/processing-status") ||
    path.startsWith("/api/processing-events")
  ) {
    return normalizedMethod === "GET"
      ? ["processing:read"]
      : ["processing:write"];
  }

  if (path.startsWith("/api/feedback")) {
    return normalizedMethod === "GET" ? ["feedback:read"] : ["feedback:write"];
  }

  if (path.startsWith("/api/model")) {
    return ["model:read"];
  }

  if (path.startsWith("/api/user")) {
    return normalizedMethod === "GET" ? ["profile:read"] : ["profile:write"];
  }

  if (
    path.startsWith("/api/bookmarks") ||
    path.startsWith("/api/documents") ||
    path.startsWith("/api/photos") ||
    path.startsWith("/api/notes") ||
    path.startsWith("/api/tags") ||
    path.startsWith("/api/all")
  ) {
    return normalizedMethod === "GET" ? ["assets:read"] : ["assets:write"];
  }

  if (path.startsWith("/api/audio")) {
    return normalizedMethod === "GET" ? ["audio:read"] : ["audio:write"];
  }

  if (path.startsWith("/api/instance")) {
    return ["profile:read"];
  }

  return null;
}
