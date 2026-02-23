import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

const routeApi = getRouteApi("/_authenticated/settings");

import { useEffect, useState } from "react";
import { MobileSettingsMenu } from "@/components/mobile/mobile-settings-menu";
import AccountSettings from "@/components/settings/AccountSettings";
import ApiKeyManager from "@/components/settings/ApiKeyManager";
import AssistantSettings from "@/components/settings/AssistantSettings";
import NotificationSettings from "@/components/settings/NotificationSettings";
import ProfileSettings from "@/components/settings/ProfileSettings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days} day${days !== 1 ? "s" : ""}, ${hours} hour${hours !== 1 ? "s" : ""}`;
  } else if (hours > 0) {
    return `${hours} hour${hours !== 1 ? "s" : ""}, ${minutes} minute${minutes !== 1 ? "s" : ""}`;
  } else {
    return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }
}

// Helper function to format build date
function formatBuildDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

type SettingsTab =
  | "profile"
  | "account"
  | "assistant"
  | "notifications"
  | "api-keys"
  | "about";

export default function SettingsContent() {
  const navigate = useNavigate();
  const { tab: tabParam } = routeApi.useSearch();
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    tabParam || "profile",
  );
  const isMobile = useIsMobile();
  const [healthData, setHealthData] = useState({
    version: "Loading...",
    fullVersion: null,
    gitHash: null,
    timestamp: null,
    buildTimestamp: null,
    uptime: null,
    environment: null,
  });

  // Update active tab when URL parameters change
  useEffect(() => {
    if (
      tabParam &&
      [
        "profile",
        "account",
        "assistant",
        "notifications",
        "api-keys",
        "about",
      ].includes(tabParam)
    ) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // Fetch health info from health API
  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        setHealthData({
          version: data.version || "Unknown",
          fullVersion: data.fullVersion || null,
          gitHash: data.gitHash || null,
          timestamp: data.timestamp || null,
          buildTimestamp: data.buildTimestamp || null,
          uptime: data.uptime || null,
          environment: data.environment || null,
        });
      })
      .catch(() => {
        setHealthData((prev) => ({ ...prev, version: "Unknown" }));
      });
  }, []);

  // Function to render the content for the current tab on mobile
  const renderMobileTabContent = () => {
    switch (activeTab) {
      case "profile":
        return <ProfileSettings />;
      case "account":
        return <AccountSettings />;
      case "assistant":
        return <AssistantSettings />;
      case "notifications":
        return <NotificationSettings />;
      case "api-keys":
        return (
          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>
                Manage your API keys and access for third-party integrations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="space-y-4">
                <ApiKeyManager />
              </div>
              <section className="space-y-4">
                <h3 className="text-lg font-semibold">API Documentation</h3>
                <div className="prose dark:prose-invert max-w-none">
                  <p>
                    To use the API, include your API key in the Authorization
                    header of your requests:
                  </p>
                  <pre className="p-4 bg-muted rounded-md overflow-x-auto">
                    <code>{`Authorization: Bearer YOUR_API_KEY`}</code>
                  </pre>
                  <p>For example:</p>
                  <pre className="p-4 bg-muted rounded-md overflow-x-auto">
                    <code>
                      {`fetch('https://api.eclaire.example/api/documents', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
})`}
                    </code>
                  </pre>
                </div>
              </section>
            </CardContent>
          </Card>
        );
      case "about":
        return (
          <Card>
            <CardHeader>
              <CardTitle>About Eclaire</CardTitle>
              <CardDescription>Version and system information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">Version</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    {healthData.version}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold">Full Version</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    {healthData.fullVersion || "Unknown"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">Git Hash</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    {healthData.gitHash || "Unknown"}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold">Build Environment</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    {healthData.environment ||
                      process.env.NODE_ENV ||
                      "development"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">Uptime</h4>
                  <p className="text-sm text-muted-foreground">
                    {healthData.uptime
                      ? formatUptime(healthData.uptime)
                      : "Unknown"}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold">Build Date</h4>
                  <p className="text-sm text-muted-foreground">
                    {healthData.buildTimestamp
                      ? formatBuildDate(healthData.buildTimestamp)
                      : healthData.timestamp
                        ? formatBuildDate(healthData.timestamp)
                        : "Unknown"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      default:
        return <ProfileSettings />;
    }
  };

  // Mobile navigation with conditional content rendering
  if (isMobile) {
    // If no specific tab is selected, show the menu
    if (!tabParam) {
      return (
        <div className="space-y-6">
          <header>
            <h1 className="text-lg md:text-3xl font-bold md:tracking-tight">
              Settings
            </h1>
            <p className="text-muted-foreground mt-1 hidden md:block">
              Manage your account settings and preferences
            </p>
          </header>

          <MobileSettingsMenu />
        </div>
      );
    }

    // Show specific settings content with back navigation
    return (
      <div className="space-y-6">
        <header className="flex items-center gap-4">
          <Link
            to="/settings"
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg md:text-3xl font-bold md:tracking-tight">
              {tabParam === "account"
                ? "Account"
                : tabParam === "assistant"
                  ? "Assistant"
                  : tabParam === "notifications"
                    ? "Notifications"
                    : tabParam === "api-keys"
                      ? "API Keys"
                      : tabParam === "about"
                        ? "About"
                        : "Profile"}
            </h1>
            <p className="text-muted-foreground mt-1 hidden md:block">
              Manage your {tabParam === "api-keys" ? "API keys" : tabParam}{" "}
              settings
            </p>
          </div>
        </header>

        {renderMobileTabContent()}
      </div>
    );
  }

  // Desktop version with tabs
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-lg md:text-3xl font-bold md:tracking-tight">
          Settings
        </h1>
        <p className="text-muted-foreground mt-1 hidden md:block">
          Manage your account settings and preferences
        </p>
      </header>

      <Tabs
        defaultValue="profile"
        value={activeTab}
        onValueChange={(newTab) => {
          setActiveTab(newTab as SettingsTab);
          navigate({ to: `/settings?tab=${newTab}` });
        }}
        className="space-y-4"
      >
        <TabsList className="grid w-full md:w-auto md:inline-flex grid-cols-6 h-auto p-1">
          <TabsTrigger value="profile" className="py-2.5">
            Profile
          </TabsTrigger>
          <TabsTrigger value="account" className="py-2.5">
            Account
          </TabsTrigger>
          <TabsTrigger value="assistant" className="py-2.5">
            Assistant
          </TabsTrigger>
          <TabsTrigger value="notifications" className="py-2.5">
            Notifications
          </TabsTrigger>
          <TabsTrigger value="api-keys" className="py-2.5">
            API Keys
          </TabsTrigger>
          <TabsTrigger value="about" className="py-2.5">
            About
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileSettings />
        </TabsContent>

        <TabsContent value="account">
          <AccountSettings />
        </TabsContent>

        <TabsContent value="assistant">
          <AssistantSettings />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationSettings />
        </TabsContent>

        <TabsContent value="api-keys">
          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>
                Manage your API keys and access for third-party integrations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="space-y-4">
                <ApiKeyManager />
              </div>

              <section className="space-y-4">
                <h3 className="text-lg font-semibold">API Documentation</h3>
                <div className="prose dark:prose-invert max-w-none">
                  <p>
                    To use the API, include your API key in the Authorization
                    header of your requests:
                  </p>
                  <pre className="p-4 bg-muted rounded-md overflow-x-auto">
                    <code>{`Authorization: Bearer YOUR_API_KEY`}</code>
                  </pre>
                  <p>For example:</p>
                  <pre className="p-4 bg-muted rounded-md overflow-x-auto">
                    <code>
                      {`fetch('https://api.eclaire.example/api/documents', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
})`}
                    </code>
                  </pre>
                </div>
              </section>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="about">
          <Card>
            <CardHeader>
              <CardTitle>About Eclaire</CardTitle>
              <CardDescription>Version and system information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">Version</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    {healthData.version}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold">Full Version</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    {healthData.fullVersion || "Unknown"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">Git Hash</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    {healthData.gitHash || "Unknown"}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold">Build Environment</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    {healthData.environment ||
                      process.env.NODE_ENV ||
                      "development"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">Uptime</h4>
                  <p className="text-sm text-muted-foreground">
                    {healthData.uptime
                      ? formatUptime(healthData.uptime)
                      : "Unknown"}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold">Build Date</h4>
                  <p className="text-sm text-muted-foreground">
                    {healthData.buildTimestamp
                      ? formatBuildDate(healthData.buildTimestamp)
                      : healthData.timestamp
                        ? formatBuildDate(healthData.timestamp)
                        : "Unknown"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
