import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiGet } from "@/lib/api-client";

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days} day${days !== 1 ? "s" : ""}, ${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours !== 1 ? "s" : ""}, ${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }
  return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
}

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

export default function AboutSettings() {
  const [healthData, setHealthData] = useState({
    version: "Loading...",
    fullVersion: null as string | null,
    gitHash: null as string | null,
    timestamp: null as string | null,
    buildTimestamp: null as string | null,
    uptime: null as number | null,
    environment: null as string | null,
  });

  useEffect(() => {
    apiGet("/api/health")
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5" />
          About Eclaire
        </CardTitle>
        <CardDescription>Version and system information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h4 className="font-semibold">Version</h4>
            <p className="font-mono text-sm text-muted-foreground">
              {healthData.version}
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold">Full Version</h4>
            <p className="font-mono text-sm text-muted-foreground">
              {healthData.fullVersion || "Unknown"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h4 className="font-semibold">Git Hash</h4>
            <p className="font-mono text-sm text-muted-foreground">
              {healthData.gitHash || "Unknown"}
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold">Build Environment</h4>
            <p className="font-mono text-sm text-muted-foreground">
              {healthData.environment || "development"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h4 className="font-semibold">Uptime</h4>
            <p className="text-sm text-muted-foreground">
              {healthData.uptime ? formatUptime(healthData.uptime) : "Unknown"}
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
}
