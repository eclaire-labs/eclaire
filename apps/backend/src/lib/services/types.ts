import type { AuthPrincipal } from "../auth-principal.js";
import type { HistoryActor } from "@eclaire/core/types";

/**
 * Identifies who is performing a service operation.
 * Used for audit history attribution — every mutating service call
 * must specify the caller so history records the correct actor.
 */
export interface CallerContext {
  actorId: string;
  actor: HistoryActor;
  ownerUserId: string;
  grantId?: string | null;
  authorizedByActorId?: string | null;
  authMethod?: AuthPrincipal["authMethod"];
  /** API key scopes (null/undefined for session/localhost callers). */
  scopes?: string[] | null;
}

/** Create a CallerContext for a human user. */
export function humanCaller(userId: string): CallerContext {
  return {
    actorId: userId,
    actor: "human",
    ownerUserId: userId,
  };
}

/** Create a CallerContext for an agent actor. */
export function agentCaller(
  actorId: string,
  ownerUserId?: string,
): CallerContext {
  return {
    actorId,
    actor: "agent",
    ownerUserId: ownerUserId ?? actorId,
  };
}

/** Create a CallerContext for a system/worker process. */
export function systemCaller(
  actorId: string,
  ownerUserId?: string,
): CallerContext {
  return {
    actorId,
    actor: "system",
    ownerUserId: ownerUserId ?? actorId,
  };
}

export function principalCaller(principal: AuthPrincipal): CallerContext {
  return {
    actorId: principal.actorId,
    actor: principal.actorKind,
    ownerUserId: principal.ownerUserId,
    grantId: principal.grantId,
    authorizedByActorId: principal.grantedByActorId,
    authMethod: principal.authMethod,
    scopes: principal.authMethod === "api_key" ? principal.scopes : undefined,
  };
}

export function callerActorId(caller: CallerContext): string {
  return caller.actorId;
}

export function callerOwnerUserId(caller: CallerContext): string {
  return caller.ownerUserId;
}
