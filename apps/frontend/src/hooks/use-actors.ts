import { useQuery } from "@tanstack/react-query";
import {
  listActors,
  type ActorKind,
  type ActorSummary,
} from "@/lib/api-actors";

export interface ActorOption extends ActorSummary {
  label: string;
  secondaryLabel: string;
  searchText: string;
  legacyUserType: "user" | "assistant" | "worker";
}

function getActorSecondaryLabel(kind: ActorKind): string {
  switch (kind) {
    case "agent":
      return "Agent actor";
    case "service":
      return "Service actor";
    case "system":
      return "System actor";
    default:
      return "Human actor";
  }
}

function toLegacyUserType(kind: ActorKind): "user" | "assistant" | "worker" {
  switch (kind) {
    case "agent":
      return "assistant";
    case "service":
    case "system":
      return "worker";
    default:
      return "user";
  }
}

export function toActorOption(actor: ActorSummary): ActorOption {
  const label = actor.displayName?.trim() || actor.id;
  const secondaryLabel = getActorSecondaryLabel(actor.kind);
  return {
    ...actor,
    label,
    secondaryLabel,
    searchText: `${label} ${actor.id} ${actor.kind}`.toLowerCase(),
    legacyUserType: toLegacyUserType(actor.kind),
  };
}

export function useActors(kinds?: ActorKind[]) {
  const query = useQuery({
    queryKey: ["actors"],
    queryFn: async () => {
      const response = await listActors();
      return response.items.map(toActorOption);
    },
    staleTime: 60_000,
  });

  const actors =
    kinds && kinds.length > 0
      ? (query.data ?? []).filter((actor) => kinds.includes(actor.kind))
      : (query.data ?? []);

  return {
    ...query,
    actors,
  };
}
