import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Link2, Link2Off, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { authClient } from "@/lib/auth";

interface SocialConnection {
  id: string;
  provider: string;
  accountId: string;
  scope: string | null;
  connectedAt: string;
}

const PROVIDER_INFO: Record<
  string,
  { name: string; description: string; icon: string }
> = {
  twitter: {
    name: "X (Twitter)",
    description:
      "Connect your X account to sync your X bookmarks into Eclaire. Tweet lookup works automatically without connecting — this is only needed for importing your bookmarks.",
    icon: "𝕏",
  },
};

export default function ConnectedAccounts() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["user-connections"],
    queryFn: async () => {
      const res = await apiFetch("/api/user/connections");
      return (await res.json()) as { items: SocialConnection[] };
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (provider: string) => {
      // Better Auth handles the full OAuth redirect flow
      const result = await authClient.signIn.social({
        provider: provider as "twitter",
        callbackURL: window.location.href,
      });
      if (result.error) {
        throw new Error(
          result.error.message ?? `Failed to connect ${provider}`,
        );
      }
      return result;
    },
    onError: (error) => {
      toast.error("Connection failed", { description: error.message });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const res = await apiFetch(`/api/user/connections/${provider}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to disconnect ${provider}`);
      }
      return res.json();
    },
    onSuccess: (_data, provider) => {
      toast.success("Disconnected", {
        description: `${PROVIDER_INFO[provider]?.name || provider} account disconnected.`,
      });
      queryClient.invalidateQueries({ queryKey: ["user-connections"] });
    },
    onError: (error) => {
      toast.error("Failed to disconnect", { description: error.message });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/bookmarks/x-sync", {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to sync bookmarks");
      }
      return res.json() as Promise<{
        message: string;
        imported: number;
        skipped: number;
        total: number;
      }>;
    },
    onSuccess: (data) => {
      toast.success("Bookmarks synced", {
        description: `Imported ${data.imported} new bookmarks (${data.skipped} already existed).`,
      });
    },
    onError: (error) => {
      toast.error("Sync failed", { description: error.message });
    },
  });

  const connections = data?.items || [];

  // Supported providers to show in the UI
  const providers = Object.keys(PROVIDER_INFO);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Accounts</CardTitle>
        <CardDescription>
          Link external accounts to enable enhanced bookmark processing with
          rich metadata and high-fidelity rendering.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading connections...
          </div>
        ) : (
          providers.map((providerId) => {
            const info = PROVIDER_INFO[providerId];
            if (!info) return null;
            const connection = connections.find(
              (c) => c.provider === providerId,
            );
            const isConnected = !!connection;

            return (
              <div
                key={providerId}
                className="flex items-start justify-between gap-4 rounded-lg border p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-lg font-bold">
                    {info.icon}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium">{info.name}</h4>
                      {isConnected && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <Link2 className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {info.description}
                    </p>
                    {isConnected && connection.connectedAt && (
                      <p className="text-xs text-muted-foreground">
                        Connected{" "}
                        {new Date(connection.connectedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col gap-2">
                  {isConnected ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncMutation.mutate()}
                        disabled={syncMutation.isPending}
                      >
                        {syncMutation.isPending ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {syncMutation.isPending
                          ? "Syncing..."
                          : "Sync Bookmarks"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => disconnectMutation.mutate(providerId)}
                        disabled={disconnectMutation.isPending}
                      >
                        <Link2Off className="mr-1.5 h-3.5 w-3.5" />
                        {disconnectMutation.isPending
                          ? "Disconnecting..."
                          : "Disconnect"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => connectMutation.mutate(providerId)}
                      disabled={connectMutation.isPending}
                    >
                      <Link2 className="mr-1.5 h-3.5 w-3.5" />
                      {connectMutation.isPending ? "Connecting..." : "Connect"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
