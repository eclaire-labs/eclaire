import { LayoutGrid, Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SidebarMode } from "@/hooks/use-sidebar-mode";

interface AppRailProps {
  mode: SidebarMode;
  onModeChange: (mode: SidebarMode) => void;
}

const railItems: {
  mode: SidebarMode;
  icon: typeof LayoutGrid;
  label: string;
}[] = [
  { mode: "content", icon: LayoutGrid, label: "Content" },
  { mode: "ai", icon: Sparkles, label: "AI" },
];

export function AppRail({ mode, onModeChange }: AppRailProps) {
  return (
    <div className="flex w-full items-center gap-0.5 rounded-lg bg-muted p-0.5">
      <TooltipProvider delayDuration={300}>
        {railItems.map((item) => {
          const isActive = mode === item.mode;
          return (
            <Tooltip key={item.mode}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onModeChange(item.mode)}
                  className={`flex h-7 flex-1 items-center justify-center rounded-md transition-colors ${
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p>{item.label}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </div>
  );
}
