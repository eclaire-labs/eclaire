import { useCallback, useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiPatch } from "@/lib/api-client";

interface InstanceSettings {
  "instance.registrationEnabled"?: boolean;
  [key: string]: unknown;
}

export default function RegistrationSettings() {
  const [settings, setSettings] = useState<InstanceSettings>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet("/api/admin/settings")
      .then((res) => res.json())
      .then((data: InstanceSettings) => setSettings(data))
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSettingChange = useCallback(
    async (key: string, value: unknown) => {
      try {
        await apiPatch("/api/admin/settings", { [key]: value });
        setSettings((prev) => ({ ...prev, [key]: value }));
        toast.success("Setting updated");
      } catch {
        toast.error("Failed to update setting");
      }
    },
    [],
  );

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Registration</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Registration
        </CardTitle>
        <CardDescription>
          Control whether new users can create accounts on this instance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Allow new user registration</Label>
            <p className="text-xs text-muted-foreground">
              When disabled, only existing users can log in.
            </p>
          </div>
          <Switch
            checked={settings["instance.registrationEnabled"] !== false}
            onCheckedChange={(checked) =>
              handleSettingChange("instance.registrationEnabled", checked)
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
