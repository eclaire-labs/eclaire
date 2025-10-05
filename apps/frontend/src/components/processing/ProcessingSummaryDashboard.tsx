"use client";

import { CheckCircle, Clock, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useProcessingEvents,
  useProcessingSummary,
} from "@/hooks/use-processing-status";

interface ProcessingSummaryDashboardProps {
  className?: string;
  noBorder?: boolean;
}

export function ProcessingSummaryDashboard({
  className = "",
  noBorder = false,
}: ProcessingSummaryDashboardProps) {
  const { summary, isLoading } = useProcessingSummary();

  // Initialize global processing events for real-time updates
  const { isConnected } = useProcessingEvents();

  if (isLoading) {
    const content = (
      <div className="flex items-center justify-center p-6">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">
            Loading processing status...
          </span>
        </div>
      </div>
    );

    if (noBorder) {
      return <div className={className}>{content}</div>;
    }

    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center p-6">
          {content}
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    const content = (
      <div className="flex items-center justify-center p-6">
        <span className="text-sm text-muted-foreground">
          No processing data available
        </span>
      </div>
    );

    if (noBorder) {
      return <div className={className}>{content}</div>;
    }

    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center p-6">
          {content}
        </CardContent>
      </Card>
    );
  }

  const content = (
    <div className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Active Status */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-muted-foreground" />
            <div className="text-sm font-medium text-muted-foreground">
              Active
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xl font-bold">{summary.totalActive}</div>
            <div className="flex flex-wrap gap-1">
              {summary.pending > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                  <Clock className="h-2.5 w-2.5 mr-1" />
                  {summary.pending}
                </Badge>
              )}
              {summary.processing > 0 && (
                <Badge variant="default" className="text-xs px-1.5 py-0.5">
                  <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                  {summary.processing}
                </Badge>
              )}
              {summary.retryPending > 0 && (
                <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                  <RefreshCw className="h-2.5 w-2.5 mr-1" />
                  {summary.retryPending}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Completed Status */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div className="text-sm font-medium text-muted-foreground">
              Completed
            </div>
          </div>
          <div className="text-xl font-bold text-green-600">
            {summary.completed}
          </div>
        </div>

        {/* Failed Status */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive" />
            <div className="text-sm font-medium text-muted-foreground">
              Failed
            </div>
          </div>
          <div className="text-xl font-bold text-destructive">
            {summary.failed}
          </div>
        </div>
      </div>
    </div>
  );

  if (noBorder) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Active Status */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-muted-foreground" />
              <div className="text-sm font-medium text-muted-foreground">
                Active
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xl font-bold">{summary.totalActive}</div>
              <div className="flex flex-wrap gap-1">
                {summary.pending > 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                    <Clock className="h-2.5 w-2.5 mr-1" />
                    {summary.pending}
                  </Badge>
                )}
                {summary.processing > 0 && (
                  <Badge variant="default" className="text-xs px-1.5 py-0.5">
                    <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                    {summary.processing}
                  </Badge>
                )}
                {summary.retryPending > 0 && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                    <RefreshCw className="h-2.5 w-2.5 mr-1" />
                    {summary.retryPending}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Completed Status */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div className="text-sm font-medium text-muted-foreground">
                Completed
              </div>
            </div>
            <div className="text-xl font-bold text-green-600">
              {summary.completed}
            </div>
          </div>

          {/* Failed Status */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              <XCircle className="h-5 w-5 text-destructive" />
              <div className="text-sm font-medium text-muted-foreground">
                Failed
              </div>
            </div>
            <div className="text-xl font-bold text-destructive">
              {summary.failed}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
