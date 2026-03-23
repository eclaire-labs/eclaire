import { Link, useParams } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  SETTINGS_NAV,
  isSeparator,
  type SettingsNavItem,
} from "./settings-nav-config";

export function SettingsMobileMenu() {
  const params = useParams({ strict: false }) as { section?: string };
  const activeSection = params.section;
  const { data: authData } = useAuth();
  const isAdmin =
    (authData?.user as Record<string, unknown> | undefined)?.isInstanceAdmin ===
    true;

  return (
    <div className="space-y-1">
      {SETTINGS_NAV.map((entry) => {
        if (isSeparator(entry)) {
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
              "flex items-center justify-between rounded-lg p-3 transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-foreground hover:bg-muted",
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md",
                  isActive ? "bg-primary/20" : "bg-muted",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-sm font-medium",
                  isActive ? "text-primary" : "text-foreground",
                )}
              >
                {item.label}
              </span>
            </div>
            <ChevronRight
              className={cn(
                "h-4 w-4",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            />
          </Link>
        );
      })}
    </div>
  );
}
