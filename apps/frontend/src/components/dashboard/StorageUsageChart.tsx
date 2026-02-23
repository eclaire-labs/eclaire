import {
  BookOpen,
  Camera,
  CheckSquare,
  FileText,
  HardDrive,
  StickyNote,
} from "lucide-react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";

interface StorageUsageChartProps {
  stats: {
    assets: {
      bookmarks: {
        count: number;
        storageSize: number;
        storageSizeFormatted: string;
      };
      documents: {
        count: number;
        storageSize: number;
        storageSizeFormatted: string;
      };
      photos: {
        count: number;
        storageSize: number;
        storageSizeFormatted: string;
      };
      notes: {
        count: number;
        storageSize: number;
        storageSizeFormatted: string;
      };
      tasks: {
        count: number;
        storageSize: number;
        storageSizeFormatted: string;
      };
      total: {
        count: number;
        storageSize: number;
        storageSizeFormatted: string;
      };
    };
  };
}

const COLORS = {
  bookmarks: "#3b82f6", // blue
  documents: "#8b5cf6", // purple
  photos: "#22c55e", // green
  notes: "#eab308", // yellow
  tasks: "#ef4444", // red
};

const chartConfig = {
  size: { label: "Storage" },
  bookmarks: { label: "Bookmarks", color: COLORS.bookmarks },
  documents: { label: "Documents", color: COLORS.documents },
  photos: { label: "Photos", color: COLORS.photos },
  notes: { label: "Notes", color: COLORS.notes },
  tasks: { label: "Tasks", color: COLORS.tasks },
} as const;

export function StorageUsageChart({ stats }: StorageUsageChartProps) {
  const data = [
    {
      name: "Bookmarks",
      value: stats.assets.bookmarks.storageSize,
      formatted: stats.assets.bookmarks.storageSizeFormatted,
      color: COLORS.bookmarks,
      icon: BookOpen,
    },
    {
      name: "Documents",
      value: stats.assets.documents.storageSize,
      formatted: stats.assets.documents.storageSizeFormatted,
      color: COLORS.documents,
      icon: FileText,
    },
    {
      name: "Photos",
      value: stats.assets.photos.storageSize,
      formatted: stats.assets.photos.storageSizeFormatted,
      color: COLORS.photos,
      icon: Camera,
    },
    {
      name: "Notes",
      value: stats.assets.notes.storageSize,
      formatted: stats.assets.notes.storageSizeFormatted,
      color: COLORS.notes,
      icon: StickyNote,
    },
    {
      name: "Tasks",
      value: stats.assets.tasks.storageSize,
      formatted: stats.assets.tasks.storageSizeFormatted,
      color: COLORS.tasks,
      icon: CheckSquare,
    },
  ].filter((item) => item.value > 0);

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{
      payload: {
        name: string;
        color: string;
        value: number;
        formatted: string;
      };
    }>;
  }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="rounded-lg border bg-background p-2 shadow-md">
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: d.color }}
            />
            <span className="font-medium">{d.name}</span>
          </div>
          <p className="text-sm text-muted-foreground">{d.formatted}</p>
        </div>
      );
    }
    return null;
  };

  if (stats.assets.total.storageSize === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            <span>Storage Usage</span>
          </CardTitle>
          <CardDescription>No storage used yet</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center">
            <HardDrive className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Start adding content to see storage breakdown
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = stats.assets.total.storageSize || 1; // avoid divide-by-zero just in case

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          <span>Storage Usage</span>
        </CardTitle>
        <CardDescription>
          Totals: {stats.assets.total.storageSizeFormatted}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Two-column layout on large screens; stacked on small */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 items-center">
          {/* Chart column (60%) */}
          <div className="lg:col-span-3 flex items-center justify-center">
            {/* Chart container with fixed height for proper vertical centering */}
            <ChartContainer
              config={chartConfig}
              className="w-full h-[280px] aspect-auto"
            >
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  // Key fix #3: use large percentage radii so the pie actually fills the square.
                  innerRadius="55%"
                  outerRadius="95%"
                  paddingAngle={2}
                  cornerRadius={3}
                >
                  {data.map((entry, _idx) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ChartContainer>
          </div>

          {/* Legend column (40%) */}
          <div className="lg:col-span-2 flex flex-col justify-center">
            <div className="grid gap-3">
              {data.map((item) => {
                const Icon = item.icon;
                const pct = ((item.value / total) * 100).toFixed(1);
                return (
                  <div
                    key={item.name}
                    className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2"
                  >
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {item.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {item.formatted}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      {pct}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
