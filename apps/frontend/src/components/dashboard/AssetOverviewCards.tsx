
import {
  BookOpen,
  Camera,
  CheckSquare,
  FileText,
  StickyNote,
} from "lucide-react";
import { Link } from "@/lib/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AssetOverviewCardsProps {
  stats: {
    assets: {
      bookmarks: { count: number; storageSizeFormatted: string };
      documents: { count: number; storageSizeFormatted: string };
      photos: { count: number; storageSizeFormatted: string };
      notes: { count: number; storageSizeFormatted: string };
      tasks: { count: number; storageSizeFormatted: string };
      total: { count: number; storageSizeFormatted: string };
    };
  };
}

export function AssetOverviewCards({ stats }: AssetOverviewCardsProps) {
  const assetTypes = [
    {
      name: "Tasks",
      icon: CheckSquare,
      color: "bg-red-500",
      textColor: "text-red-600",
      bgColor: "bg-red-50",
      darkBgColor: "dark:bg-red-950",
      count: stats.assets.tasks.count,
      storage: stats.assets.tasks.storageSizeFormatted,
      href: "/tasks",
    },
    {
      name: "Notes",
      icon: StickyNote,
      color: "bg-yellow-500",
      textColor: "text-yellow-600",
      bgColor: "bg-yellow-50",
      darkBgColor: "dark:bg-yellow-950",
      count: stats.assets.notes.count,
      storage: stats.assets.notes.storageSizeFormatted,
      href: "/notes",
    },
    {
      name: "Bookmarks",
      icon: BookOpen,
      color: "bg-blue-500",
      textColor: "text-blue-600",
      bgColor: "bg-blue-50",
      darkBgColor: "dark:bg-blue-950",
      count: stats.assets.bookmarks.count,
      storage: stats.assets.bookmarks.storageSizeFormatted,
      href: "/bookmarks",
    },
    {
      name: "Documents",
      icon: FileText,
      color: "bg-purple-500",
      textColor: "text-purple-600",
      bgColor: "bg-purple-50",
      darkBgColor: "dark:bg-purple-950",
      count: stats.assets.documents.count,
      storage: stats.assets.documents.storageSizeFormatted,
      href: "/documents",
    },
    {
      name: "Photos",
      icon: Camera,
      color: "bg-green-500",
      textColor: "text-green-600",
      bgColor: "bg-green-50",
      darkBgColor: "dark:bg-green-950",
      count: stats.assets.photos.count,
      storage: stats.assets.photos.storageSizeFormatted,
      href: "/photos",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {assetTypes.map((asset) => {
        const Icon = asset.icon;
        return (
          <Link key={asset.name} href={asset.href}>
            <Card
              className={`transition-all duration-200 hover:shadow-lg cursor-pointer border-l-4 border-l-transparent hover:border-l-current ${asset.bgColor} ${asset.darkBgColor}`}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className={`text-sm font-medium ${asset.textColor}`}>
                  {asset.name}
                </CardTitle>
                <Icon className={`h-4 w-4 ${asset.textColor}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${asset.textColor}`}>
                  {asset.count.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {asset.storage}
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
