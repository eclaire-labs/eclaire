import type {
  ActorApiKey,
  ActorSummary,
  AdminAccessLevel,
  ApiKeyScope,
  CreatedActorApiKey,
  DataAccessLevel,
} from "@eclaire/api-types";
import {
  derivePermissionLevels,
  resolvePermissionScopes,
} from "@eclaire/api-types";
import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import {
  formatApiKeyForDisplay,
  generateFullApiKey,
} from "../api-key-security.js";
import {
  FULL_ACCESS_SCOPE,
  getApiKeyScopeCatalog,
  normalizeGrantedScopes,
} from "../auth-principal.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import {
  DEFAULT_AGENT_ACTOR_ID,
  DEFAULT_AGENT_ACTOR_NAME,
} from "./actor-constants.js";
import {
  ensureHumanActorForUserId,
  getActorSummaryOrNull,
  getDefaultAgentActorSummary,
} from "./actors.js";

const logger = createChildLogger("services:actor-credentials");

const { actorCredentials, actorGrants, actors } = schema;

type CredentialRow = {
  id: string;
  actorId: string;
  actorKind: ActorSummary["kind"];
  actorDisplayName: string | null;
  ownerUserId: string;
  grantId: string;
  grantedByActorId: string | null;
  keyId: string;
  keyHash: string;
  hashVersion: number;
  keySuffix: string;
  name: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  isActive: boolean;
  revokedAt: Date | null;
  scopes: string[];
};

export interface CreateActorApiKeyInput {
  name?: string | null;
  scopes?: ApiKeyScope[];
  dataAccess?: DataAccessLevel;
  adminAccess?: AdminAccessLevel;
  expiresAt?: Date | null;
}

export interface UpdateActorApiKeyInput {
  name?: string;
  scopes?: ApiKeyScope[];
  dataAccess?: DataAccessLevel;
  adminAccess?: AdminAccessLevel;
  expiresAt?: Date | null;
}

export interface ResolvedApiKeyCredential {
  credentialId: string;
  actorId: string;
  actorKind: ActorSummary["kind"];
  ownerUserId: string;
  grantId: string;
  grantedByActorId: string | null;
  scopes: ApiKeyScope[];
  keyHash: string;
  hashVersion: number;
}

function normalizeApiKeyName(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed?.length
    ? trimmed
    : `API Key ${new Date().toISOString().split("T")[0]}`;
}

function resolveScopesFromInput(input: {
  scopes?: ApiKeyScope[];
  dataAccess?: DataAccessLevel;
  adminAccess?: AdminAccessLevel;
}): ApiKeyScope[] | undefined {
  if (input.dataAccess !== undefined && input.adminAccess !== undefined) {
    return resolvePermissionScopes(input.dataAccess, input.adminAccess);
  }
  return input.scopes;
}

function validateAndNormalizeScopes(
  scopes?: ApiKeyScope[] | null,
): ApiKeyScope[] {
  const validScopes = new Set(
    getApiKeyScopeCatalog().map((item) => item.scope),
  );
  const normalized = normalizeGrantedScopes(scopes);

  for (const scope of normalized) {
    if (!validScopes.has(scope)) {
      throw new ValidationError(`Unknown API key scope: ${scope}`, "scopes");
    }
  }

  return normalized.includes(FULL_ACCESS_SCOPE)
    ? [FULL_ACCESS_SCOPE]
    : normalized;
}

async function resolveOwnedActor(
  ownerUserId: string,
  actorId: string,
): Promise<ActorSummary> {
  if (actorId === DEFAULT_AGENT_ACTOR_ID) {
    throw new ValidationError(
      `The default ${DEFAULT_AGENT_ACTOR_NAME} actor cannot authenticate with an API key`,
    );
  }

  if (actorId === ownerUserId) {
    const humanActor = await ensureHumanActorForUserId(ownerUserId);
    if (!humanActor) {
      throw new NotFoundError("Actor", actorId);
    }
    return humanActor;
  }

  const actor = await getActorSummaryOrNull(ownerUserId, actorId);
  if (!actor) {
    throw new NotFoundError("Actor", actorId);
  }

  return actor;
}

function mapCredentialRowToApiKey(row: CredentialRow): ActorApiKey {
  const scopes = validateAndNormalizeScopes(row.scopes as ApiKeyScope[]);
  const permissionLevels = derivePermissionLevels(scopes);
  return {
    id: row.id,
    actor: {
      id: row.actorId,
      kind: row.actorKind,
      displayName:
        row.actorId === DEFAULT_AGENT_ACTOR_ID
          ? getDefaultAgentActorSummary().displayName
          : row.actorDisplayName,
    },
    grantId: row.grantId,
    displayKey: formatApiKeyForDisplay(row.keyId, row.keySuffix),
    name: row.name,
    scopes,
    dataAccess: permissionLevels?.dataAccess ?? null,
    adminAccess: permissionLevels?.adminAccess ?? null,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    isActive: row.isActive && !row.revokedAt,
  };
}

async function fetchActorCredentialRows(
  ownerUserId: string,
  actorId?: string,
): Promise<CredentialRow[]> {
  const now = new Date();

  return db
    .select({
      id: actorCredentials.id,
      actorId: actorCredentials.actorId,
      actorKind: actors.kind,
      actorDisplayName: actors.displayName,
      ownerUserId: actorCredentials.ownerUserId,
      grantId: actorCredentials.grantId,
      grantedByActorId: actorGrants.grantedByActorId,
      keyId: actorCredentials.keyId,
      keyHash: actorCredentials.keyHash,
      hashVersion: actorCredentials.hashVersion,
      keySuffix: actorCredentials.keySuffix,
      name: actorCredentials.name,
      lastUsedAt: actorCredentials.lastUsedAt,
      expiresAt: actorCredentials.expiresAt,
      createdAt: actorCredentials.createdAt,
      isActive: actorCredentials.isActive,
      revokedAt: actorGrants.revokedAt,
      scopes: actorGrants.scopes,
    })
    .from(actorCredentials)
    .innerJoin(actors, eq(actors.id, actorCredentials.actorId))
    .innerJoin(actorGrants, eq(actorGrants.id, actorCredentials.grantId))
    .where(
      and(
        eq(actorCredentials.ownerUserId, ownerUserId),
        actorId ? eq(actorCredentials.actorId, actorId) : undefined,
        eq(actorCredentials.isActive, true),
        isNull(actorGrants.revokedAt),
        or(
          isNull(actorCredentials.expiresAt),
          gte(actorCredentials.expiresAt, now),
        ),
        or(isNull(actorGrants.expiresAt), gte(actorGrants.expiresAt, now)),
      ),
    )
    .orderBy(desc(actorCredentials.createdAt));
}

export async function listActorApiKeys(
  ownerUserId: string,
  actorId: string,
): Promise<ActorApiKey[]> {
  await resolveOwnedActor(ownerUserId, actorId);
  const keys = await fetchActorCredentialRows(ownerUserId, actorId);
  return keys.map(mapCredentialRowToApiKey);
}

export async function createActorApiKey(
  ownerUserId: string,
  actorId: string,
  input: CreateActorApiKeyInput,
  grantedByActorId: string | null = ownerUserId,
): Promise<CreatedActorApiKey> {
  const actor = await resolveOwnedActor(ownerUserId, actorId);
  const resolvedScopes = resolveScopesFromInput(input);
  const scopes = validateAndNormalizeScopes(resolvedScopes);
  const keyName = normalizeApiKeyName(input.name);
  const { fullKey, keyId, hash, hashVersion, suffix } = generateFullApiKey();

  const [grant] = await db
    .insert(actorGrants)
    .values({
      actorId: actor.id,
      ownerUserId,
      grantedByActorId,
      name: keyName,
      scopes,
      expiresAt: input.expiresAt ?? null,
    })
    .returning({
      id: actorGrants.id,
    });

  if (!grant) {
    throw new Error("Failed to create actor grant");
  }

  const [credential] = await db
    .insert(actorCredentials)
    .values({
      actorId: actor.id,
      ownerUserId,
      grantId: grant.id,
      keyId,
      keyHash: hash,
      hashVersion,
      keySuffix: suffix,
      name: keyName,
      expiresAt: input.expiresAt ?? null,
    })
    .returning({
      id: actorCredentials.id,
      keyId: actorCredentials.keyId,
      keySuffix: actorCredentials.keySuffix,
      name: actorCredentials.name,
      createdAt: actorCredentials.createdAt,
      lastUsedAt: actorCredentials.lastUsedAt,
      expiresAt: actorCredentials.expiresAt,
      isActive: actorCredentials.isActive,
    });

  if (!credential) {
    throw new Error("Failed to create actor credential");
  }

  logger.info(
    { ownerUserId, actorId: actor.id, credentialId: credential.id },
    "Created actor API key",
  );

  const permissionLevels = derivePermissionLevels(scopes);
  return {
    id: credential.id,
    key: fullKey,
    actor,
    grantId: grant.id,
    displayKey: formatApiKeyForDisplay(credential.keyId, credential.keySuffix),
    name: credential.name,
    scopes,
    dataAccess: permissionLevels?.dataAccess ?? null,
    adminAccess: permissionLevels?.adminAccess ?? null,
    createdAt: credential.createdAt.toISOString(),
    lastUsedAt: null,
    expiresAt: credential.expiresAt?.toISOString() ?? null,
    isActive: credential.isActive,
  };
}

async function getOwnedCredentialRow(
  ownerUserId: string,
  actorId: string,
  credentialId: string,
): Promise<CredentialRow> {
  await resolveOwnedActor(ownerUserId, actorId);

  const [credential] = await db
    .select({
      id: actorCredentials.id,
      actorId: actorCredentials.actorId,
      actorKind: actors.kind,
      actorDisplayName: actors.displayName,
      ownerUserId: actorCredentials.ownerUserId,
      grantId: actorCredentials.grantId,
      grantedByActorId: actorGrants.grantedByActorId,
      keyId: actorCredentials.keyId,
      keyHash: actorCredentials.keyHash,
      hashVersion: actorCredentials.hashVersion,
      keySuffix: actorCredentials.keySuffix,
      name: actorCredentials.name,
      lastUsedAt: actorCredentials.lastUsedAt,
      expiresAt: actorCredentials.expiresAt,
      createdAt: actorCredentials.createdAt,
      isActive: actorCredentials.isActive,
      revokedAt: actorGrants.revokedAt,
      scopes: actorGrants.scopes,
    })
    .from(actorCredentials)
    .innerJoin(actors, eq(actors.id, actorCredentials.actorId))
    .innerJoin(actorGrants, eq(actorGrants.id, actorCredentials.grantId))
    .where(
      and(
        eq(actorCredentials.id, credentialId),
        eq(actorCredentials.ownerUserId, ownerUserId),
        eq(actorCredentials.actorId, actorId),
      ),
    );

  if (!credential) {
    throw new NotFoundError("API key");
  }

  return credential;
}

export async function updateActorApiKey(
  ownerUserId: string,
  actorId: string,
  credentialId: string,
  input: UpdateActorApiKeyInput,
): Promise<ActorApiKey> {
  const existing = await getOwnedCredentialRow(
    ownerUserId,
    actorId,
    credentialId,
  );

  const nextName =
    input.name !== undefined ? normalizeApiKeyName(input.name) : existing.name;
  const resolvedScopes = resolveScopesFromInput(input);
  const nextScopes =
    resolvedScopes !== undefined
      ? validateAndNormalizeScopes(resolvedScopes)
      : validateAndNormalizeScopes(existing.scopes as ApiKeyScope[]);
  const nextExpiresAt =
    input.expiresAt !== undefined ? input.expiresAt : existing.expiresAt;
  const now = new Date();

  await db
    .update(actorGrants)
    .set({
      name: nextName,
      scopes: nextScopes,
      expiresAt: nextExpiresAt ?? null,
      updatedAt: now,
    })
    .where(eq(actorGrants.id, existing.grantId));

  await db
    .update(actorCredentials)
    .set({
      name: nextName,
      expiresAt: nextExpiresAt ?? null,
      updatedAt: now,
    })
    .where(eq(actorCredentials.id, credentialId));

  const updated = await getOwnedCredentialRow(
    ownerUserId,
    actorId,
    credentialId,
  );
  return mapCredentialRowToApiKey(updated);
}

export async function revokeActorApiKey(
  ownerUserId: string,
  actorId: string,
  credentialId: string,
): Promise<void> {
  const existing = await getOwnedCredentialRow(
    ownerUserId,
    actorId,
    credentialId,
  );
  const now = new Date();

  await db
    .update(actorCredentials)
    .set({
      isActive: false,
      updatedAt: now,
    })
    .where(eq(actorCredentials.id, existing.id));

  await db
    .update(actorGrants)
    .set({
      revokedAt: now,
      updatedAt: now,
    })
    .where(eq(actorGrants.id, existing.grantId));
}

export async function resolveApiKeyCredential(
  keyId: string,
): Promise<ResolvedApiKeyCredential | null> {
  const now = new Date();
  const [credential] = await db
    .select({
      credentialId: actorCredentials.id,
      actorId: actorCredentials.actorId,
      actorKind: actors.kind,
      ownerUserId: actorCredentials.ownerUserId,
      grantId: actorCredentials.grantId,
      grantedByActorId: actorGrants.grantedByActorId,
      scopes: actorGrants.scopes,
      keyHash: actorCredentials.keyHash,
      hashVersion: actorCredentials.hashVersion,
    })
    .from(actorCredentials)
    .innerJoin(actors, eq(actors.id, actorCredentials.actorId))
    .innerJoin(actorGrants, eq(actorGrants.id, actorCredentials.grantId))
    .where(
      and(
        eq(actorCredentials.keyId, keyId),
        eq(actorCredentials.isActive, true),
        isNull(actorGrants.revokedAt),
        or(
          isNull(actorCredentials.expiresAt),
          gte(actorCredentials.expiresAt, now),
        ),
        or(isNull(actorGrants.expiresAt), gte(actorGrants.expiresAt, now)),
      ),
    );

  if (!credential) {
    return null;
  }

  return {
    credentialId: credential.credentialId,
    actorId: credential.actorId,
    actorKind: credential.actorKind,
    ownerUserId: credential.ownerUserId,
    grantId: credential.grantId,
    grantedByActorId: credential.grantedByActorId,
    scopes: validateAndNormalizeScopes(credential.scopes as ApiKeyScope[]),
    keyHash: credential.keyHash,
    hashVersion: credential.hashVersion,
  };
}

export async function touchActorCredentialUsage(
  credentialId: string,
): Promise<void> {
  await db
    .update(actorCredentials)
    .set({
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(actorCredentials.id, credentialId));
}

export async function assertActorCredentialAccess(
  ownerUserId: string,
  actorId: string,
  currentActorId: string,
): Promise<void> {
  const actor = await resolveOwnedActor(ownerUserId, actorId);
  const currentActor = await getActorSummaryOrNull(ownerUserId, currentActorId);

  if (!currentActor) {
    throw new ForbiddenError("Actor is not available in this workspace");
  }

  if (currentActor.kind === "human") {
    return;
  }

  if (currentActor.id !== actor.id) {
    throw new ForbiddenError(
      "Actor cannot manage credentials for another actor",
    );
  }
}
