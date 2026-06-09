import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface PageLoadingProps {
  /** "detail" = header skeleton + centered spinner; "list" = pulsing card rows. */
  variant?: "list" | "detail";
  /** Route to navigate back to from the detail header (e.g. "/notes"). */
  backTo?: string;
}

/** Standard page-level loading state. */
export function PageLoading({ variant = "detail", backTo }: PageLoadingProps) {
  const navigate = useNavigate();

  if (variant === "list") {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {backTo && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: backTo })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}

interface PageErrorProps {
  /** Heading, e.g. "Note not found". */
  title: string;
  /** Detail line under the heading (defaults to a generic explanation). */
  message?: string;
  /** Route for the action button (e.g. "/notes"). */
  backTo?: string;
  /** Label for the action button (e.g. "Go to Notes"). */
  backLabel?: string;
  onRetry?: () => void;
}

/** Standard page-level error state. */
export function PageError({
  title,
  message,
  backTo,
  backLabel,
  onRetry,
}: PageErrorProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {backTo && (
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: backTo })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
      )}
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">{title}</h2>
        {message && <p className="text-muted-foreground mb-4">{message}</p>}
        <div className="flex items-center gap-2">
          {onRetry && (
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          )}
          {backTo && (
            <Button onClick={() => navigate({ to: backTo })}>
              {backLabel ?? "Go back"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
