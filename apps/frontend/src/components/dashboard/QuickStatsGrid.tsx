"use client";

import { Eye, Flag, Pin, Zap } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuickStatsGridProps {
  quickStats: {
    pinned: {
      total: number;
      bookmarks: number;
      documents: number;
      photos: number;
      notes: number;
    };
    pendingReview: {
      total: number;
      bookmarks: number;
      documents: number;
      photos: number;
    };
    flagged: {
      total: number;
      bookmarks: number;
      documents: number;
      photos: number;
    };
    processing: number;
  };
}

export function QuickStatsGrid({ quickStats }: QuickStatsGridProps) {
  const stats = [
    {
      title: "Pinned",
      value: quickStats.pinned.total,
      icon: Pin,
      color: "text-blue-600",
      href: "/all/pinned",
    },
    {
      title: "Pending Review",
      value: quickStats.pendingReview.total,
      icon: Eye,
      color: "text-orange-600",
      href: "/all/pending",
    },
    {
      title: "Flagged",
      value: quickStats.flagged.total,
      icon: Flag,
      color: "text-red-600",
      href: "/all/flagged",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Link key={stat.title} href={stat.href}>
            <Card className="transition-all duration-200 hover:shadow-lg cursor-pointer hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${stat.color}`}>
                  {stat.value}
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
