import { Link, Outlet, useParams } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { SettingsNav } from "./SettingsNav";
import { SettingsMobileMenu } from "./SettingsMobileMenu";

function SectionLoading() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function SettingsLayout() {
  const isMobile = useIsMobile();
  const params = useParams({ strict: false }) as { section?: string };
  const hasSection = !!params.section;

  if (isMobile) {
    // On mobile: show menu when no section, show content when section selected
    if (!hasSection) {
      return (
        <div className="flex h-dvh flex-col bg-background">
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <Link
              to="/dashboard"
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-lg font-semibold">Settings</h1>
          </header>
          <ScrollArea className="flex-1">
            <div className="p-4">
              <SettingsMobileMenu />
            </div>
          </ScrollArea>
        </div>
      );
    }

    return (
      <div className="flex h-dvh flex-col bg-background">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <Link
            to="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-semibold">Settings</h1>
        </header>
        <ScrollArea className="flex-1">
          <div className="p-4">
            <Suspense fallback={<SectionLoading />}>
              <Outlet />
            </Suspense>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="flex h-dvh bg-background">
      {/* Sidebar */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r">
        <div className="flex items-center gap-3 px-4 py-4">
          <Link
            to="/dashboard"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
        <ScrollArea className="flex-1 px-3 pb-4">
          <SettingsNav />
        </ScrollArea>
      </aside>

      {/* Content area */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-8">
          <Suspense fallback={<SectionLoading />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
