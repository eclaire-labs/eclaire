import { Loader2, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * Admin configuration section (reusable for STT / TTS cards).
 */
export function AdminConfigSection({
  isAdmin,
  loading,
  readOnlyBadges,
  children,
}: {
  isAdmin: boolean;
  loading: boolean;
  readOnlyBadges: { label: string; value: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-muted/30 px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Workspace configuration
        </span>
        {isAdmin && (
          <Badge variant="outline" className="text-[10px] font-normal">
            Admin
          </Badge>
        )}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading...
        </div>
      ) : isAdmin ? (
        <div className="space-y-4">{children}</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {readOnlyBadges.map((b) => (
            <Badge
              key={b.label}
              variant="secondary"
              className="text-xs font-normal"
            >
              {b.label}: {b.value}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
