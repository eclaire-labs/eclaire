import { Link, useLocation } from "@tanstack/react-router";
import { Tag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePopularTags } from "@/hooks/use-popular-tags";
import { useSidebarPreferences } from "@/hooks/use-sidebar-preferences";

export function PopularTagsSection() {
  const [prefs] = useSidebarPreferences();
  const { data: tags, isLoading } = usePopularTags(
    prefs.showPopularTags ? prefs.popularTagCount : 0,
  );
  const { pathname } = useLocation();

  if (!prefs.showPopularTags) return null;

  // Check if a tag is currently active in the /all view
  const isAllRoute = pathname === "/all" || pathname === "/all/";
  let activeTag: string | undefined;
  try {
    // Safe access to search params - only when on /all route
    if (isAllRoute && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      activeTag = params.get("tag") ?? undefined;
    }
  } catch {
    // ignore
  }

  if (isLoading) {
    return (
      <div className="mt-1">
        <div className="h-px bg-border my-2" />
        <div className="px-3 py-1.5">
          <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
            Tags
          </span>
        </div>
        <div className="space-y-1 px-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-5/6" />
        </div>
      </div>
    );
  }

  if (!tags || tags.length === 0) return null;

  return (
    <div className="mt-1">
      <div className="h-px bg-border my-2" />
      <div className="px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
          Tags
        </span>
      </div>
      <ul className="space-y-0.5">
        {tags.map((tag) => {
          const isActive = isAllRoute && activeTag === tag.name;
          return (
            <li key={tag.name}>
              <Link
                to="/all"
                search={{ tag: tag.name }}
                className={`flex items-center justify-between px-3 py-1.5 rounded-md text-sm ${
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
                <span className="flex items-center gap-2 truncate">
                  <Tag className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{tag.name}</span>
                </span>
                <span className="text-xs text-muted-foreground/60 ml-2 shrink-0">
                  {tag.count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
