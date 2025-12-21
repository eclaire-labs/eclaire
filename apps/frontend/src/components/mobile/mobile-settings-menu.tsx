
import {
  Bell,
  Bot,
  ChevronRight,
  Info,
  Key,
  Settings,
  User,
} from "lucide-react";
import { Link, useLocation, getRouteApi } from "@tanstack/react-router";

const routeApi = getRouteApi("/_authenticated/settings");
import { cn } from "@/lib/utils";

interface SettingsMenuItem {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}

const settingsMenuItems: SettingsMenuItem[] = [
  {
    id: "profile",
    label: "Profile",
    description: "Manage your personal information",
    icon: User,
    href: "/settings?tab=profile",
  },
  {
    id: "account",
    label: "Account",
    description: "Account settings and preferences",
    icon: Settings,
    href: "/settings?tab=account",
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Configure notification preferences",
    icon: Bell,
    href: "/settings?tab=notifications",
  },
  {
    id: "assistant",
    label: "Assistant",
    description: "AI assistant settings and behavior",
    icon: Bot,
    href: "/settings?tab=assistant",
  },
  {
    id: "api-keys",
    label: "API Keys",
    description: "Manage API keys and integrations",
    icon: Key,
    href: "/settings?tab=api-keys",
  },
  {
    id: "about",
    label: "About",
    description: "Version info and system details",
    icon: Info,
    href: "/settings?tab=about",
  },
];

export function MobileSettingsMenu() {
  const { pathname } = useLocation();
  const { tab } = routeApi.useSearch();
  const currentTab = tab || "profile";

  return (
    <div className="space-y-1">
      {settingsMenuItems.map((item) => {
        const isActive = currentTab === item.id;
        const Icon = item.icon;

        return (
          <Link
            key={item.id}
            to={item.href}
            className={cn(
              "flex items-center justify-between p-4 rounded-lg transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-foreground hover:bg-muted",
            )}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-md",
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

              <div className="flex-1 min-w-0">
                <div
                  className={cn(
                    "font-medium text-sm",
                    isActive ? "text-primary" : "text-foreground",
                  )}
                >
                  {item.label}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {item.description}
                </div>
              </div>
            </div>

            <ChevronRight
              className={cn(
                "h-4 w-4 ml-2 flex-shrink-0",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            />
          </Link>
        );
      })}
    </div>
  );
}
