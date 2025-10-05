"use client";

import { ChevronLeft, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import AccountSettings from "@/app/(main)/settings/components/AccountSettings";
import AssistantSettings from "@/app/(main)/settings/components/AssistantSettings";
import NotificationSettings from "@/app/(main)/settings/components/NotificationSettings";
import ProfileSettings from "@/app/(main)/settings/components/ProfileSettings";
import { MobileSettingsMenu } from "@/components/mobile/mobile-settings-menu";
import ApiKeyManager from "@/components/settings/ApiKeyManager";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export default function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabParam || "profile");
  const isMobile = useIsMobile();
  const [healthData, setHealthData] = useState({
    version: "Loading...",
    fullVersion: null,
    buildNumber: null,
    gitHash: null,
    timestamp: null,
    buildTimestamp: null,
    uptime: null,
    environment: null,
  });
  const [changelogContent, setChangelogContent] = useState<string>("");
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [changelogError, setChangelogError] = useState<string | null>(null);

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
          buildNumber: data.buildNumber || null,
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

  // Function to fetch changelog content
  const fetchChangelog = async () => {
    if (changelogContent) return; // Already loaded

    setChangelogLoading(true);
    setChangelogError(null);

    try {
      const response = await fetch("/api/changelog");
      const data = await response.json();

      if (data.status === "success") {
        setChangelogContent(data.content);
      } else {
        setChangelogError(data.error || "Failed to load changelog");
      }
    } catch (error) {
      setChangelogError("Failed to fetch changelog");
    } finally {
      setChangelogLoading(false);
    }
  };

  // Function to render markdown content as HTML (simple implementation)
  const renderMarkdown = (markdown: string) => {
    return (
      markdown
        .replace(/^# (.+$)/gim, '<h1 class="text-2xl font-bold mb-4">$1</h1>')
        .replace(
          /^## (.+$)/gim,
          '<h2 class="text-xl font-semibold mb-3 mt-6">$1</h2>',
        )
        .replace(
          /^### (.+$)/gim,
          '<h3 class="text-lg font-medium mb-2 mt-4">$1</h3>',
        )
        .replace(/^- (.+$)/gim, '<li class="ml-4">$1</li>')
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        // Handle paragraph breaks properly - convert double newlines to paragraph breaks
        .replace(/\n\n/g, '</p><p class="mb-4">')
        // Wrap the entire content in paragraph tags and handle single newlines as spaces
        .replace(/\n/g, " ")
        // Wrap with initial paragraph tag
        .replace(/^/, '<p class="mb-4">')
        .replace(/$/, "</p>")
    );
  };

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
                  <h4 className="font-semibold">Build Number</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    {healthData.buildNumber || "Unknown"}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold">Git Hash</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    {healthData.gitHash || "Unknown"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">Build Environment</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    {healthData.environment ||
                      process.env.NODE_ENV ||
                      "development"}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold">Uptime</h4>
                  <p className="text-sm text-muted-foreground">
                    {healthData.uptime
                      ? formatUptime(healthData.uptime)
                      : "Unknown"}
                  </p>
                </div>
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
              <div className="pt-4 border-t">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" onClick={fetchChangelog}>
                      <FileText className="w-4 h-4 mr-2" />
                      View Changelog
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh]">
                    <ScrollArea className="h-[60vh] w-full rounded-md border p-4">
                      {changelogLoading && (
                        <div className="flex items-center justify-center py-8">
                          <div className="text-sm text-muted-foreground">
                            Loading changelog...
                          </div>
                        </div>
                      )}
                      {changelogError && (
                        <div className="flex items-center justify-center py-8">
                          <div className="text-sm text-destructive">
                            {changelogError}
                          </div>
                        </div>
                      )}
                      {changelogContent && !changelogLoading && (
                        <div
                          className="prose dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdown(changelogContent),
                          }}
                        />
                      )}
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
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
            href="/settings"
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
          setActiveTab(newTab);
          router.push(`/settings?tab=${newTab}`);
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
                  <h4 className="font-semibold">Build Number</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    {healthData.buildNumber || "Unknown"}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold">Git Hash</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    {healthData.gitHash || "Unknown"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">Build Environment</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    {healthData.environment ||
                      process.env.NODE_ENV ||
                      "development"}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold">Uptime</h4>
                  <p className="text-sm text-muted-foreground">
                    {healthData.uptime
                      ? formatUptime(healthData.uptime)
                      : "Unknown"}
                  </p>
                </div>
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

              <div className="pt-4 border-t">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" onClick={fetchChangelog}>
                      <FileText className="w-4 h-4 mr-2" />
                      View Changelog
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh]">
                    <ScrollArea className="h-[60vh] w-full rounded-md border p-4">
                      {changelogLoading && (
                        <div className="flex items-center justify-center py-8">
                          <div className="text-sm text-muted-foreground">
                            Loading changelog...
                          </div>
                        </div>
                      )}
                      {changelogError && (
                        <div className="flex items-center justify-center py-8">
                          <div className="text-sm text-destructive">
                            {changelogError}
                          </div>
                        </div>
                      )}
                      {changelogContent && !changelogLoading && (
                        <div
                          className="prose dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdown(changelogContent),
                          }}
                        />
                      )}
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
