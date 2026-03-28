import type { ActorSummary } from "@eclaire/api-types";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import { recordHistory } from "./history.js";
import type { CallerContext } from "./types.js";
import {
  DEFAULT_AGENT_ACTOR_ID,
  DEFAULT_AGENT_ACTOR_NAME,
} from "./actor-constants.js";

const { actors, humanActors, users } = schema;

const logger = createChildLogger("services:actors");

function getHumanActorDisplayName(user: {
  displayName: string | null;
  fullName: string | null;
  email: string;
}) {
  return user.displayName || user.fullName || user.email;
}

export function getDefaultAgentActorSummary(): ActorSummary {
  return {
    id: DEFAULT_AGENT_ACTOR_ID,
    kind: "agent",
    displayName: DEFAULT_AGENT_ACTOR_NAME,
  };
}

export async function ensureHumanActorForUserId(
  userId: string,
): Promise<ActorSummary | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      displayName: true,
      fullName: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    return null;
  }

  const displayName = getHumanActorDisplayName(user);

  await db
    .insert(actors)
    .values({
      id: user.id,
      ownerUserId: user.id,
      kind: "human",
      displayName,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .onConflictDoUpdate({
      target: actors.id,
      set: {
        ownerUserId: user.id,
        kind: "human",
        displayName,
        updatedAt: user.updatedAt,
      },
    });

  await db
    .insert(humanActors)
    .values({
      actorId: user.id,
      userId: user.id,
    })
    .onConflictDoNothing();

  return {
    id: user.id,
    kind: "human",
    displayName,
  };
}

export async function createAgentActor(
  ownerUserId: string,
  actorId: string,
  displayName: string,
): Promise<void> {
  await db
    .insert(actors)
    .values({
      id: actorId,
      ownerUserId,
      kind: "agent",
      displayName,
    })
    .onConflictDoUpdate({
      target: actors.id,
      set: {
        ownerUserId,
        kind: "agent",
        displayName,
        updatedAt: new Date(),
      },
    });
}

export async function updateAgentActorDisplayName(
  ownerUserId: string,
  actorId: string,
  displayName: string,
): Promise<void> {
  const updated = await db
    .update(actors)
    .set({
      displayName,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(actors.id, actorId),
        eq(actors.ownerUserId, ownerUserId),
        eq(actors.kind, "agent"),
      ),
    )
    .returning({ id: actors.id });

  if (updated.length === 0) {
    logger.warn(
      { ownerUserId, actorId },
      "Agent actor missing during display name update; recreating actor row",
    );
    await createAgentActor(ownerUserId, actorId, displayName);
  }
}

export async function deleteAgentActor(
  ownerUserId: string,
  actorId: string,
): Promise<void> {
  await db
    .delete(actors)
    .where(
      and(
        eq(actors.id, actorId),
        eq(actors.ownerUserId, ownerUserId),
        eq(actors.kind, "agent"),
      ),
    );
}

export async function listActorSummaries(
  ownerUserId: string,
): Promise<ActorSummary[]> {
  const humanActor = await ensureHumanActorForUserId(ownerUserId);

  const ownedActors = await db
    .select({
      id: actors.id,
      kind: actors.kind,
      displayName: actors.displayName,
    })
    .from(actors)
    .where(and(eq(actors.ownerUserId, ownerUserId), ne(actors.id, ownerUserId)))
    .orderBy(desc(actors.updatedAt), desc(actors.createdAt));

  const customAgents = ownedActors.filter(
    (actor) => actor.kind === "agent" && actor.id !== DEFAULT_AGENT_ACTOR_ID,
  );
  const serviceActors = ownedActors.filter((actor) => actor.kind === "service");

  return [
    ...(humanActor ? [humanActor] : []),
    getDefaultAgentActorSummary(),
    ...customAgents.map((agent) => ({
      id: agent.id,
      kind: "agent" as const,
      displayName: agent.displayName,
    })),
    ...serviceActors.map((actor) => ({
      id: actor.id,
      kind: "service" as const,
      displayName: actor.displayName,
    })),
  ];
}

export async function getActorSummary(
  ownerUserId: string,
  actorId: string,
): Promise<ActorSummary> {
  if (actorId === DEFAULT_AGENT_ACTOR_ID) {
    await createAgentActor(
      ownerUserId,
      DEFAULT_AGENT_ACTOR_ID,
      DEFAULT_AGENT_ACTOR_NAME,
    );
    return getDefaultAgentActorSummary();
  }

  if (actorId === ownerUserId) {
    const humanActor = await ensureHumanActorForUserId(ownerUserId);
    if (humanActor) {
      return humanActor;
    }
  }

  const actor = await db.query.actors.findFirst({
    where: and(eq(actors.id, actorId), eq(actors.ownerUserId, ownerUserId)),
    columns: {
      id: true,
      kind: true,
      displayName: true,
    },
  });

  if (!actor) {
    throw new NotFoundError("Actor", actorId);
  }

  return actor;
}

export async function getActorSummaryOrNull(
  ownerUserId: string,
  actorId: string | null | undefined,
): Promise<ActorSummary | null> {
  if (!actorId) {
    return null;
  }

  try {
    return await getActorSummary(ownerUserId, actorId);
  } catch (_error) {
    return null;
  }
}

export async function isAgentActor(
  ownerUserId: string,
  actorId: string | null | undefined,
): Promise<boolean> {
  const actor = await getActorSummaryOrNull(ownerUserId, actorId);
  return actor?.kind === "agent";
}

export async function createServiceActor(
  ownerUserId: string,
  displayName: string,
  caller?: CallerContext,
): Promise<ActorSummary> {
  const trimmedName = displayName.trim();
  if (!trimmedName) {
    throw new ValidationError("Display name is required", "displayName");
  }

  const [serviceActor] = await db
    .insert(actors)
    .values({
      ownerUserId,
      kind: "service",
      displayName: trimmedName,
    })
    .returning({
      id: actors.id,
      kind: actors.kind,
      displayName: actors.displayName,
    });

  if (!serviceActor) {
    throw new Error("Failed to create service actor");
  }

  if (caller) {
    await recordHistory({
      action: "create",
      itemType: "actor",
      itemId: serviceActor.id,
      itemName: trimmedName,
      beforeData: null,
      afterData: { kind: "service", displayName: trimmedName },
      actor: caller.actor,
      actorId: caller.actorId,
      authorizedByActorId: caller.authorizedByActorId ?? null,
      grantId: caller.grantId ?? null,
      userId: caller.ownerUserId,
    });
  }

  return serviceActor;
}

export async function deleteServiceActor(
  ownerUserId: string,
  actorId: string,
  caller?: CallerContext,
): Promise<void> {
  const existing = await getActorSummaryOrNull(ownerUserId, actorId);

  const deleted = await db
    .delete(actors)
    .where(
      and(
        eq(actors.id, actorId),
        eq(actors.ownerUserId, ownerUserId),
        eq(actors.kind, "service"),
      ),
    )
    .returning({ id: actors.id });

  if (deleted.length === 0) {
    throw new NotFoundError("Actor", actorId);
  }

  if (caller) {
    await recordHistory({
      action: "delete",
      itemType: "actor",
      itemId: actorId,
      itemName: existing?.displayName ?? undefined,
      beforeData: existing
        ? { kind: existing.kind, displayName: existing.displayName }
        : null,
      afterData: null,
      actor: caller.actor,
      actorId: caller.actorId,
      authorizedByActorId: caller.authorizedByActorId ?? null,
      grantId: caller.grantId ?? null,
      userId: caller.ownerUserId,
    });
  }
}
