import { Chrome, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  attachBrowser,
  detachBrowser,
  getBrowserStatus,
} from "@/lib/api-browser";
import type { BrowserStatus } from "@/types/browser";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function getStatusBadgeVariant(
  state: BrowserStatus["state"],
): "default" | "secondary" | "destructive" | "outline" {
  switch (state) {
    case "connected":
      return "default";
    case "error":
      return "destructive";
    case "disabled":
      return "outline";
    default:
      return "secondary";
  }
}

export default function ChromeBrowserControlCard() {
  const [status, setStatus] = useState<BrowserStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setStatus(await getBrowserStatus());
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load browser status",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleAttach = async () => {
    try {
      setIsMutating(true);
      setStatus(await attachBrowser());
      toast.success("Chrome browser control attached");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to attach Chrome browser control",
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleDetach = async () => {
    try {
      setIsMutating(true);
      setStatus(await detachBrowser());
      toast.success("Chrome browser control detached");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to detach Chrome browser control",
      );
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Chrome className="h-5 w-5" />
          Chrome Browser Control
        </CardTitle>
        <CardDescription>
          Let compatible agents use your live Chrome session for authenticated,
          interactive browsing. This is local-only and higher trust than the
          public-web browser tool.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Signed-in browser access</AlertTitle>
          <AlertDescription>
            Agents can see and act inside pages already available in your local
            Chrome session. Keep this disabled if you do not want that level of
            access.
          </AlertDescription>
        </Alert>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading browser status...
          </div>
        ) : status ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getStatusBadgeVariant(status.state)}>
                {status.state}
              </Badge>
              <Badge variant="outline">{status.profile.label}</Badge>
              <Badge variant="outline">{status.transport}</Badge>
              <Badge variant="secondary">{status.tabCount} tabs</Badge>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Availability</span>
                <span>{status.available ? "Ready" : "Unavailable"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Active tab</span>
                <span className="truncate text-right">
                  {status.activeTab?.title || "None selected"}
                </span>
              </div>
              {status.lastError && (
                <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {status.lastError}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleAttach}
                disabled={
                  isMutating ||
                  !status.enabled ||
                  !status.available ||
                  status.state === "connecting"
                }
              >
                {isMutating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {status.state === "connected" ? "Reconnect" : "Attach"}
              </Button>
              <Button
                variant="outline"
                onClick={handleDetach}
                disabled={isMutating || status.state !== "connected"}
              >
                Detach
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
