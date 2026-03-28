import { Link, useLocation } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarSettingsButtonProps {
  collapsed: boolean;
}

export function SidebarSettingsButton({
  collapsed,
}: SidebarSettingsButtonProps) {
  const { pathname } = useLocation();
  const isActive = pathname.startsWith("/settings");

  const link = (
    <Link
      to="/settings"
      className={`flex items-center rounded-md text-sm ${
        collapsed ? "justify-center p-2" : "gap-3 px-3 py-2"
      } ${
        isActive
          ? "font-medium"
          : "text-muted-foreground hover:bg-[hsl(var(--hover-bg))]"
      }`}
      style={
        isActive
          ? {
              backgroundColor: `hsl(var(--sidebar-active-bg) / var(--sidebar-active-bg-opacity))`,
              color: `hsl(var(--sidebar-active-text))`,
            }
          : undefined
      }
    >
      <Settings className="h-4 w-4 shrink-0" />
      {!collapsed && <span>Settings</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            Settings
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return link;
}
