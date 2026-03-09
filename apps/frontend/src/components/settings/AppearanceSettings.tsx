import { LayoutDashboard, Tag } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSidebarPreferences } from "@/hooks/use-sidebar-preferences";

export default function AppearanceSettings() {
  const [prefs, updatePref] = useSidebarPreferences();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5" />
          Appearance
        </CardTitle>
        <CardDescription>
          Customize the look and feel of your workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Sidebar</h4>
            <p className="text-sm text-muted-foreground">
              Configure the sidebar navigation.
            </p>
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="flex items-center space-x-3">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label
                  htmlFor="show-popular-tags"
                  className="text-sm font-normal"
                >
                  Show popular tags
                </Label>
                <p className="text-xs text-muted-foreground">
                  Display your most-used tags in the sidebar for quick filtering
                </p>
              </div>
            </div>
            <Switch
              id="show-popular-tags"
              checked={prefs.showPopularTags}
              onCheckedChange={(checked) =>
                updatePref("showPopularTags", checked)
              }
            />
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="flex items-center space-x-3">
              <div className="h-4 w-4" />
              <div className="space-y-0.5">
                <Label
                  htmlFor="popular-tag-count"
                  className="text-sm font-normal"
                >
                  Number of tags to show
                </Label>
                <p className="text-xs text-muted-foreground">
                  How many popular tags to display (1-50)
                </p>
              </div>
            </div>
            <Input
              id="popular-tag-count"
              type="number"
              min={1}
              max={50}
              value={prefs.popularTagCount}
              onChange={(e) => {
                const val = Math.max(
                  1,
                  Math.min(50, Number(e.target.value) || 1),
                );
                updatePref("popularTagCount", val);
              }}
              className="w-20"
              disabled={!prefs.showPopularTags}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
