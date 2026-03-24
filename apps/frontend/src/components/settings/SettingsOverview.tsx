import { Link } from "@tanstack/react-router";
import {
  Bot,
  Cpu,
  Key,
  Plug,
  Radio,
  Server,
  Sliders,
  Sparkles,
  User,
  Users,
  Volume2,
  Wrench,
} from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

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
  const { data: authData } = useAuth();
  const isAdmin =
    (authData?.user as Record<string, unknown> | undefined)?.isInstanceAdmin ===
    true;

  const visibleLinks = quickLinks.filter((link) => !link.adminOnly || isAdmin);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Manage your account, assistant, and system configuration.
        </p>
      </div>

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
