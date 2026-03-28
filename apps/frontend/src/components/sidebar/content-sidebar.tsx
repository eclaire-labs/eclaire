import { Link, useLocation } from "@tanstack/react-router";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
import { PopularTagsSection } from "@/components/dashboard/popular-tags-section";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  separator?: boolean;
  isDialog?: boolean;
  badge?: number;
}

interface ContentSidebarProps {
  navigation: NavItem[];
  collapsed: boolean;
}

export function ContentSidebar({ navigation, collapsed }: ContentSidebarProps) {
  const { pathname } = useLocation();

  const isActive = (path: string) => {
    if (pathname === path) return true;
    if (path === "/all" && pathname.startsWith("/all/")) return false;
    if (path !== "/dashboard" && path !== "/all" && pathname.startsWith(path))
      return true;
    return false;
  };

  const activeClass = "font-medium";
  const inactiveClass = "text-muted-foreground hover:bg-[hsl(var(--hover-bg))]";

  const activeStyle = (href: string) =>
    isActive(href)
      ? {
          backgroundColor: `hsl(var(--sidebar-active-bg) / var(--sidebar-active-bg-opacity))`,
          color: `hsl(var(--sidebar-active-text))`,
        }
      : undefined;

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <nav className="p-2">
          <ul className="space-y-1">
            {navigation.map((item) => (
              <li key={item.name}>
                {item.isDialog ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <FeedbackDialog
                        trigger={
                          <button
                            type="button"
                            className={`flex items-center justify-center rounded-md p-2 w-full ${inactiveClass}`}
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                          </button>
                        }
                      />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        to={item.href}
                        className={`flex items-center justify-center rounded-md p-2 ${
                          isActive(item.href) ? activeClass : inactiveClass
                        }`}
                        style={activeStyle(item.href)}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      {item.name}
                      {item.badge != null && item.badge > 0 && (
                        <span className="ml-1">
                          ({item.badge > 99 ? "99+" : item.badge})
                        </span>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </TooltipProvider>
    );
  }

  return (
    <nav className="p-3">
      <ul className="space-y-1">
        {navigation.map((item) => (
          <li key={item.name}>
            {item.separator && <div className="h-px bg-border my-2" />}
            {item.isDialog ? (
              <FeedbackDialog
                trigger={
                  <button
                    type="button"
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${inactiveClass} w-full text-left`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </button>
                }
              />
            ) : (
              <Link
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
                  isActive(item.href) ? activeClass : inactiveClass
                }`}
                style={activeStyle(item.href)}
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.name}</span>
                {item.badge != null && item.badge > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground min-w-[18px]">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </Link>
            )}
          </li>
        ))}
      </ul>
      <PopularTagsSection />
    </nav>
  );
}
