import { Link, useParams } from "@tanstack/react-router";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  SETTINGS_NAV,
  isSeparator,
  type SettingsNavItem,
} from "./settings-nav-config";

export function SettingsNav() {
  const params = useParams({ strict: false }) as { section?: string };
  const activeSection = params.section;
  const { data: authData } = useAuth();
  const isAdmin =
    (authData?.user as Record<string, unknown> | undefined)?.isInstanceAdmin ===
    true;

  return (
    <nav className="space-y-1">
      {SETTINGS_NAV.map((entry) => {
        if (isSeparator(entry)) {
          // Hide the Administration header for non-admins
          if (entry.key === "sep-admin" && !isAdmin) return null;
          return (
            <div key={entry.key}>
              <Separator className="my-2" />
              {entry.label && (
                <span className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {entry.label}
                </span>
              )}
            </div>
          );
        }

        const item = entry as SettingsNavItem;
        if (item.adminOnly && !isAdmin) return null;

        const isActive = activeSection === item.id;
        const Icon = item.icon;

        return (
          <Link
            key={item.id}
            to="/settings/$section"
            params={{ section: item.id }}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
