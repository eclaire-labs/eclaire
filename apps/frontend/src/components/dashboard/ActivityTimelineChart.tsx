
import { format } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ActivityTimelineChartProps {
  data: Array<{
    date: string;
    bookmarks: number;
    documents: number;
    photos: number;
    notes: number;
    tasks: number;
    total: number;
  }>;
  period: number;
  onPeriodChange: (period: number) => void;
}

const chartConfig = {
  bookmarks: {
    label: "Bookmarks",
    color: "hsl(var(--chart-1))",
  },
  documents: {
    label: "Documents",
    color: "hsl(var(--chart-2))",
  },
  photos: {
    label: "Photos",
    color: "hsl(var(--chart-3))",
  },
  notes: {
    label: "Notes",
    color: "hsl(var(--chart-4))",
  },
  tasks: {
    label: "Tasks",
    color: "hsl(var(--chart-5))",
  },
};

export function ActivityTimelineChart({
  data,
  period,
  onPeriodChange,
}: ActivityTimelineChartProps) {
  const totalItems = data.reduce((sum, day) => sum + day.total, 0);
  const avgPerDay =
    totalItems > 0 ? (totalItems / data.length).toFixed(1) : "0";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Activity Timeline</CardTitle>
            <CardDescription>
              Items added over the last {period} days • {totalItems} total •{" "}
              {avgPerDay} avg/day
            </CardDescription>
          </div>
          <Select
            value={period.toString()}
            onValueChange={(value) => onPeriodChange(Number(value))}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] aspect-auto">
          <AreaChart
            data={data}
            margin={{
              top: 10,
              right: 30,
              left: 0,
              bottom: 0,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => format(new Date(value), "MMM d")}
              interval="preserveStartEnd"
            />
            <YAxis />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) =>
                    format(new Date(value), "MMMM d, yyyy")
                  }
                />
              }
            />
            <Area
              type="monotone"
              dataKey="bookmarks"
              stackId="1"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="documents"
              stackId="1"
              stroke="#8b5cf6"
              fill="#8b5cf6"
              fillOpacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="photos"
              stackId="1"
              stroke="#22c55e"
              fill="#22c55e"
              fillOpacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="notes"
              stackId="1"
              stroke="#eab308"
              fill="#eab308"
              fillOpacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="tasks"
              stackId="1"
              stroke="#ef4444"
              fill="#ef4444"
              fillOpacity={0.6}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
