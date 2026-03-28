"use client";

import {
  Bot,
  ChevronDown,
  Cpu,
  Search,
  UserRound,
  Workflow,
} from "lucide-react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ActorOption } from "@/hooks/use-actors";
import type { ActorKind } from "@/lib/api-actors";

interface ActorPickerProps {
  actors: ActorOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  allowUnassigned?: boolean;
  unassignedLabel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

function getActorKindLabel(kind: ActorKind): string {
  switch (kind) {
    case "agent":
      return "Agent";
    case "service":
      return "Service";
    case "system":
      return "System";
    default:
      return "Person";
  }
}

function ActorGlyph({
  actor,
  className,
}: {
  actor: Pick<ActorOption, "kind" | "label">;
  className?: string;
}) {
  if (actor.kind === "agent") {
    return (
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-sm shadow-primary/10",
          className,
        )}
      >
        <Bot className="size-4" />
      </div>
    );
  }

  if (actor.kind === "service") {
    return (
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 shadow-sm shadow-emerald-500/10 dark:text-emerald-300",
          className,
        )}
      >
        <Workflow className="size-4" />
      </div>
    );
  }

  if (actor.kind === "system") {
    return (
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10 text-amber-700 shadow-sm shadow-amber-500/10 dark:text-amber-300",
          className,
        )}
      >
        <Cpu className="size-4" />
      </div>
    );
  }

  const initials = actor.label
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={cn(
        "flex size-9 items-center justify-center rounded-2xl border border-border/80 bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted))_100%)] text-[11px] font-semibold tracking-[0.18em] text-foreground shadow-sm",
        className,
      )}
    >
      {initials || <UserRound className="size-4" />}
    </div>
  );
}

function ActorPickerItem({
  actor,
  selected,
}: {
  actor: ActorOption;
  selected: boolean;
}) {
  return (
    <div className="flex w-full items-center gap-3">
      <ActorGlyph actor={actor} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{actor.label}</span>
          <Badge
            variant="secondary"
            className="rounded-full px-2 py-0 text-[10px] uppercase tracking-[0.18em]"
          >
            {getActorKindLabel(actor.kind)}
          </Badge>
        </div>
      </div>
      <div
        className={cn(
          "size-2 rounded-full transition-colors",
          selected ? "bg-primary shadow-sm shadow-primary/80" : "bg-border",
        )}
      />
    </div>
  );
}

export function ActorPicker({
  actors,
  value,
  onChange,
  placeholder = "Select actor",
  searchPlaceholder = "Search actors...",
  emptyMessage = "No actors found.",
  allowUnassigned = false,
  unassignedLabel = "Unassigned",
  disabled = false,
  className,
  id,
}: ActorPickerProps) {
  const [open, setOpen] = useState(false);
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const selectedActor = actors.find((actor) => actor.id === value) ?? null;

  const humans = actors.filter((actor) => actor.kind === "human");
  const agents = actors.filter((actor) => actor.kind === "agent");
  const services = actors.filter(
    (actor) => actor.kind === "service" || actor.kind === "system",
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={triggerId}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-auto min-h-14 w-full justify-between rounded-2xl border-border/70 px-3 py-2 text-left shadow-sm transition-all hover:border-primary/30 hover:bg-accent/30",
            selectedActor &&
              "bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_55%)]",
            className,
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            {selectedActor ? (
              <ActorGlyph actor={selectedActor} />
            ) : (
              <div className="flex size-9 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40 text-muted-foreground">
                <Search className="size-4" />
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate font-medium">
                {selectedActor ? selectedActor.label : unassignedLabel}
              </div>
              {selectedActor && (
                <div className="truncate text-xs text-muted-foreground">
                  {selectedActor.secondaryLabel}
                </div>
              )}
            </div>
          </div>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] rounded-3xl border-border/80 p-0 shadow-2xl shadow-black/5"
      >
        <Command className="bg-transparent">
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-[22rem] p-2">
            <CommandEmpty>{emptyMessage}</CommandEmpty>

            {allowUnassigned ? (
              <>
                <CommandGroup heading="Optional">
                  <CommandItem
                    value={unassignedLabel}
                    onSelect={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                    className="rounded-2xl px-3 py-2.5"
                  >
                    <div className="flex w-full items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/50 text-muted-foreground">
                        <Search className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{unassignedLabel}</div>
                      </div>
                    </div>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            ) : null}

            {agents.length > 0 && (
              <CommandGroup heading="Agents">
                {agents.map((actor) => (
                  <CommandItem
                    key={actor.id}
                    value={actor.searchText}
                    onSelect={() => {
                      onChange(actor.id);
                      setOpen(false);
                    }}
                    className="rounded-2xl px-3 py-2.5"
                  >
                    <ActorPickerItem
                      actor={actor}
                      selected={value === actor.id}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {humans.length > 0 && (
              <CommandGroup heading="People">
                {humans.map((actor) => (
                  <CommandItem
                    key={actor.id}
                    value={actor.searchText}
                    onSelect={() => {
                      onChange(actor.id);
                      setOpen(false);
                    }}
                    className="rounded-2xl px-3 py-2.5"
                  >
                    <ActorPickerItem
                      actor={actor}
                      selected={value === actor.id}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {services.length > 0 && (
              <CommandGroup heading="Infrastructure">
                {services.map((actor) => (
                  <CommandItem
                    key={actor.id}
                    value={actor.searchText}
                    onSelect={() => {
                      onChange(actor.id);
                      setOpen(false);
                    }}
                    className="rounded-2xl px-3 py-2.5"
                  >
                    <ActorPickerItem
                      actor={actor}
                      selected={value === actor.id}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
