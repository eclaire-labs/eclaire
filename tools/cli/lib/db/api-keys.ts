/**
 * API key CRUD operations for the CLI.
 * Direct database access using Drizzle ORM.
 */

import { and, eq } from "drizzle-orm";
import { generateApiKeyId, generateSecurityId } from "@eclaire/core";
import { getDb } from "./index.js";
import {
  formatApiKeyForDisplay,
  generateFullApiKey,
} from "./api-key-security.js";

export interface ApiKeyRow {
  id: string;
  actorId: string;
  ownerUserId: string;
  grantId: string;
  keyId: string;
  keySuffix: string;
  name: string;
  scopes: string[];
  lastUsedAt: Date | number | null;
  expiresAt: Date | number | null;
  isActive: boolean;
  createdAt: Date | number;
  displayKey: string;
  actorKind: string;
  actorName: string | null;
}

export interface CreateApiKeyInput {
  ownerUserId: string;
  actorId: string;
  actorKind: string;
  name: string;
  scopes: string[];
  expiresAt?: Date | null;
}

type DbQuery = {
  // biome-ignore lint/suspicious/noExplicitAny: DbInstance is a union type, queries work across all dialects
  db: any;
  // biome-ignore lint/suspicious/noExplicitAny: schema table refs are dialect-polymorphic
  actorCredentials: any;
  // biome-ignore lint/suspicious/noExplicitAny: schema table refs are dialect-polymorphic
  actorGrants: any;
  // biome-ignore lint/suspicious/noExplicitAny: schema table refs are dialect-polymorphic
  actors: any;
};

function query(): DbQuery {
  const { db, schema } = getDb();
  return {
    db,
    actorCredentials: schema.actorCredentials,
    actorGrants: schema.actorGrants,
    actors: schema.actors,
  };
}

export async function listApiKeys(ownerUserId: string): Promise<ApiKeyRow[]> {
  const { db, actorCredentials, actorGrants, actors } = query();

  // Fetch credentials
  const credentials = await db
    .select()
    .from(actorCredentials)
    .where(eq(actorCredentials.ownerUserId, ownerUserId));

  if (credentials.length === 0) return [];

  // Fetch grants for scopes
  const grants = await db
    .select()
    .from(actorGrants)
    .where(eq(actorGrants.ownerUserId, ownerUserId));
  const grantMap = new Map<string, { scopes: string[] }>();
  for (const g of grants) {
    grantMap.set(g.id, { scopes: g.scopes ?? [] });
  }

  // Fetch actors for display names
  const actorRows = await db
    .select()
    .from(actors)
    .where(eq(actors.ownerUserId, ownerUserId));
  const actorMap = new Map<
    string,
    { kind: string; displayName: string | null }
  >();
  for (const a of actorRows) {
    actorMap.set(a.id, { kind: a.kind, displayName: a.displayName });
  }

  return credentials.map(
    (c: {
      id: string;
      actorId: string;
      ownerUserId: string;
      grantId: string;
      keyId: string;
      keySuffix: string;
      name: string;
      lastUsedAt: Date | number | null;
      expiresAt: Date | number | null;
      isActive: boolean;
      createdAt: Date | number;
    }) => {
      const grant = grantMap.get(c.grantId);
      const actor = actorMap.get(c.actorId);
      return {
        id: c.id,
        actorId: c.actorId,
        ownerUserId: c.ownerUserId,
        grantId: c.grantId,
        keyId: c.keyId,
        keySuffix: c.keySuffix,
        name: c.name,
        scopes: grant?.scopes ?? [],
        lastUsedAt: c.lastUsedAt,
        expiresAt: c.expiresAt,
        isActive: c.isActive,
        createdAt: c.createdAt,
        displayKey: formatApiKeyForDisplay(c.keyId, c.keySuffix),
        actorKind: actor?.kind ?? "unknown",
        actorName: actor?.displayName ?? null,
      };
    },
  );
}

export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<{ row: ApiKeyRow; fullKey: string }> {
  const { db, actorCredentials, actorGrants } = query();

  // Generate the cryptographic key material
  const { fullKey, keyId, hash, hashVersion, suffix } = generateFullApiKey();

  // Create grant (holds scopes)
  const grantId = generateSecurityId();
  await db.insert(actorGrants).values({
    id: grantId,
    actorId: input.actorId,
    ownerUserId: input.ownerUserId,
    name: input.name,
    scopes: input.scopes,
    expiresAt: input.expiresAt ?? null,
  });

  // Create credential
  const credentialId = generateApiKeyId();
  await db.insert(actorCredentials).values({
    id: credentialId,
    actorId: input.actorId,
    ownerUserId: input.ownerUserId,
    grantId,
    type: "api_key",
    keyId,
    keyHash: hash,
    hashVersion,
    keySuffix: suffix,
    name: input.name,
    expiresAt: input.expiresAt ?? null,
    isActive: true,
  });

  const row: ApiKeyRow = {
    id: credentialId,
    actorId: input.actorId,
    ownerUserId: input.ownerUserId,
    grantId,
    keyId,
    keySuffix: suffix,
    name: input.name,
    scopes: input.scopes,
    lastUsedAt: null,
    expiresAt: input.expiresAt ?? null,
    isActive: true,
    createdAt: new Date(),
    displayKey: formatApiKeyForDisplay(keyId, suffix),
    actorKind: input.actorKind,
    actorName: null,
  };

  return { row, fullKey };
}

export async function revokeApiKey(
  credentialId: string,
  ownerUserId: string,
): Promise<boolean> {
  const { db, actorCredentials, actorGrants } = query();

  // Find the credential
  const creds = await db
    .select()
    .from(actorCredentials)
    .where(
      and(
        eq(actorCredentials.id, credentialId),
        eq(actorCredentials.ownerUserId, ownerUserId),
      ),
    )
    .limit(1);

  if (creds.length === 0) return false;

  const cred = creds[0];

  // Deactivate credential
  await db
    .update(actorCredentials)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(actorCredentials.id, credentialId));

  // Revoke grant
  await db
    .update(actorGrants)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(actorGrants.id, cred.grantId));

  return true;
}
