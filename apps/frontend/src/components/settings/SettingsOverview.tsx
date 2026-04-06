import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bot,
  Cpu,
  Key,
  Plug,
  Radio,
  RefreshCw,
  Server,
  Sliders,
  Sparkles,
  User,
  Users,
  Volume2,
  Wrench,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useOnboardingState, useResetOnboarding } from "@/hooks/use-onboarding";

interface QuickLink {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const quickLinks: QuickLink[] = [
  {
    id: "profile",
    label: "Profile",
    description: "Name, avatar, and timezone",
    icon: User,
  },
  {
    id: "assistant",
    label: "Assistant",
    description: "Display and behavior options",
    icon: Bot,
  },
  {
    id: "voice",
    label: "Voice",
    description: "Speech-to-text and text-to-speech",
    icon: Volume2,
  },
  {
    id: "tools",
    label: "Tools",
    description: "Available tools and integrations",
    icon: Wrench,
  },
  {
    id: "skills",
    label: "Skills",
    description: "AI skill catalog",
    icon: Sparkles,
  },
  {
    id: "mcp-servers",
    label: "MCP Servers",
    description: "Model Context Protocol servers",
    icon: Plug,
    adminOnly: true,
  },
  {
    id: "browser",
    label: "Browser",
    description: "Chrome browser integration",
    icon: Sliders,
    adminOnly: true,
  },
  {
    id: "channels",
    label: "Channels",
    description: "Slack, Telegram, and more",
    icon: Radio,
  },
  {
    id: "api-keys",
    label: "API Keys",
    description: "Manage API access",
    icon: Key,
  },
  {
    id: "models",
    label: "Models",
    description: "Manage AI models",
    icon: Cpu,
    adminOnly: true,
  },
  {
    id: "providers",
    label: "Providers",
    description: "Manage AI providers",
    icon: Server,
    adminOnly: true,
  },
  {
    id: "users",
    label: "Users",
    description: "User accounts and roles",
    icon: Users,
    adminOnly: true,
  },
];

export default function SettingsOverview() {
  const navigate = useNavigate();
  const { data: authData } = useAuth();
  const isAdmin =
    (authData?.user as Record<string, unknown> | undefined)?.isInstanceAdmin ===
    true;
  const { data: onboardingState } = useOnboardingState(isAdmin);
  const resetOnboarding = useResetOnboarding();

  const visibleLinks = quickLinks.filter((link) => !link.adminOnly || isAdmin);
  const isOnboardingIncomplete =
    isAdmin && onboardingState && onboardingState.status !== "completed";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Manage your account, assistant, and system configuration.
        </p>
      </div>

      {isOnboardingIncomplete && (
        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle>Finish Setting Up Eclaire</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              Some features may not work correctly until setup is complete.
            </span>
            <Link to="/setup">
              <Button size="sm" variant="outline" className="ml-4 shrink-0">
                Resume Setup
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {isAdmin && onboardingState?.status === "completed" && (
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Instance Setup</p>
            <p className="text-xs text-muted-foreground">
              Re-run the setup wizard to reconfigure AI providers and models.
              Existing configuration is preserved.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={resetOnboarding.isPending}
            onClick={async () => {
              await resetOnboarding.mutateAsync();
              navigate({ to: "/setup" });
            }}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Re-run Setup
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visibleLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.id}
              to="/settings/$section"
              params={{ section: link.id }}
              className="group"
            >
              <Card className="transition-colors group-hover:bg-accent/50">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">{link.label}</CardTitle>
                      <CardDescription className="text-xs">
                        {link.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
