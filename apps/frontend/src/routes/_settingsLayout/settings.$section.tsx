import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SETTINGS_NAV,
  VALID_SECTIONS,
  isSeparator,
  type SettingsNavItem,
} from "@/components/settings/settings-nav-config";

/** Redirects for renamed/removed sections */
const SECTION_REDIRECTS: Record<string, string> = {
  "audio-defaults": "voice-defaults",
  registration: "users",
};

// Lazy-loaded section components
const SECTION_COMPONENTS: Record<
  string,
  React.LazyExoticComponent<React.ComponentType>
> = {
  // User
  profile: lazy(() => import("@/components/settings/ProfileSettings")),
  account: lazy(() => import("@/components/settings/AccountSettings")),
  appearance: lazy(() => import("@/components/settings/AppearanceSettings")),

  // AI & Voice
  assistant: lazy(
    () => import("@/components/settings/AssistantGeneralSettings"),
  ),
  voice: lazy(() => import("@/components/settings/VoiceSettings")),

  // Tools & Integrations
  tools: lazy(() => import("@/components/settings/ToolsSettings")),
  skills: lazy(() => import("@/components/settings/SkillsSettings")),
  "mcp-servers": lazy(
    () => import("@/components/settings/admin/McpServerManager"),
  ),
  browser: lazy(() => import("@/components/settings/ChromeBrowserControlCard")),
  channels: lazy(() => import("@/components/settings/ChannelSettings")),
  "api-keys": lazy(() => import("@/components/settings/ApiKeySettings")),

  // Administration (admin-only)
  models: lazy(() => import("@/components/settings/admin/ModelManager")),
  providers: lazy(() => import("@/components/settings/admin/ProviderManager")),
  "model-defaults": lazy(
    () => import("@/components/settings/admin/ModelSelectionSettings"),
  ),
  "voice-defaults": lazy(
    () => import("@/components/settings/admin/AudioDefaultsSettings"),
  ),
  users: lazy(() => import("@/components/settings/admin/UserManager")),

  // About
  about: lazy(() => import("@/components/settings/AboutSettings")),
};

function SectionLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export const Route = createFileRoute("/_settingsLayout/settings/$section")({
  beforeLoad: ({ params, context }) => {
    // Handle redirects for renamed sections
    const redirectTo = SECTION_REDIRECTS[params.section];
    if (redirectTo) {
      throw redirect({
        to: "/settings/$section",
        params: { section: redirectTo },
      });
    }
    if (!VALID_SECTIONS.includes(params.section)) {
      throw redirect({ to: "/settings" });
    }
    // Block non-admins from admin-only sections
    const navItem = SETTINGS_NAV.find(
      (e): e is SettingsNavItem => !isSeparator(e) && e.id === params.section,
    );
    if (navItem?.adminOnly && !context.auth?.user?.isInstanceAdmin) {
      throw redirect({ to: "/settings" });
    }
  },
  component: function SettingsSection() {
    const { section } = Route.useParams();
    const Component = SECTION_COMPONENTS[section];

    if (!Component) {
      return (
        <div className="text-center text-muted-foreground py-12">
          Section not found.
        </div>
      );
    }

    return (
      <Suspense fallback={<SectionLoading />}>
        <Component />
      </Suspense>
    );
  },
});
