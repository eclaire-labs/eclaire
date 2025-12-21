
import { format } from "date-fns";
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckSquare,
  Clock,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface DueItem {
  id: string;
  title: string;
  dueDate: string | Date;
  type: "bookmark" | "task";
}

interface DueItemsWidgetProps {
  dueItems: {
    overdue: DueItem[];
    dueToday: DueItem[];
    dueThisWeek: DueItem[];
  };
}

function DueItemRow({ item }: { item: DueItem }) {
  const icon = item.type === "bookmark" ? BookOpen : CheckSquare;
  const Icon = icon;
  const href =
    item.type === "bookmark" ? `/bookmarks/${item.id}` : `/tasks/${item.id}`;

  return (
    <Link to={href}>
      <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.title}</p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(item.dueDate), "MMM d, yyyy")}
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {item.type}
        </Badge>
      </div>
    </Link>
  );
}

export function DueItemsWidget({ dueItems }: DueItemsWidgetProps) {
  const totalDue =
    dueItems.overdue.length +
    dueItems.dueToday.length +
    dueItems.dueThisWeek.length;

  if (totalDue === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CheckSquare className="h-5 w-5 text-green-500" />
            <span>Due Items</span>
          </CardTitle>
          <CardDescription>All caught up!</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <CheckSquare className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              No items are due. Great work!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Calendar className="h-5 w-5" />
          <span>Due Items</span>
        </CardTitle>
        <CardDescription>
          {totalDue} item{totalDue !== 1 ? "s" : ""} need
          {totalDue === 1 ? "s" : ""} attention
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="space-y-4 flex-1">
          {dueItems.overdue.length > 0 && (
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-red-600">
                  Overdue ({dueItems.overdue.length})
                </span>
              </div>
              <div className="space-y-1">
                {dueItems.overdue.slice(0, 3).map((item) => (
                  <DueItemRow key={item.id} item={item} />
                ))}
                {dueItems.overdue.length > 3 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">
                    +{dueItems.overdue.length - 3} more overdue items
                  </p>
                )}
              </div>
            </div>
          )}

          {dueItems.dueToday.length > 0 && (
            <>
              {dueItems.overdue.length > 0 && <Separator />}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium text-orange-600">
                    Due Today ({dueItems.dueToday.length})
                  </span>
                </div>
                <div className="space-y-1">
                  {dueItems.dueToday.slice(0, 3).map((item) => (
                    <DueItemRow key={item.id} item={item} />
                  ))}
                  {dueItems.dueToday.length > 3 && (
                    <p className="text-xs text-muted-foreground px-2 py-1">
                      +{dueItems.dueToday.length - 3} more due today
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {dueItems.dueThisWeek.length > 0 && (
            <>
              {(dueItems.overdue.length > 0 ||
                dueItems.dueToday.length > 0) && <Separator />}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <Calendar className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-medium text-yellow-600">
                    Due This Week ({dueItems.dueThisWeek.length})
                  </span>
                </div>
                <div className="space-y-1">
                  {dueItems.dueThisWeek.slice(0, 2).map((item) => (
                    <DueItemRow key={item.id} item={item} />
                  ))}
                  {dueItems.dueThisWeek.length > 2 && (
                    <p className="text-xs text-muted-foreground px-2 py-1">
                      +{dueItems.dueThisWeek.length - 2} more due this week
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {totalDue > 0 && (
          <div className="pt-4 mt-auto">
            <Link to="/tasks">
              <Button variant="outline" size="sm" className="w-full">
                View All Due Items
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
