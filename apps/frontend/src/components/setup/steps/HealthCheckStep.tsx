import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useRunHealthCheck,
  type HealthCheckResult,
} from "@/hooks/use-onboarding";
import type { StepProps } from "../SetupWizard";

function StatusIcon({ ok }: { ok: boolean | undefined }) {
  if (ok === undefined)
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  return ok ? (
    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
  ) : (
    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
  );
}

function CheckRow({
  label,
  ok,
  error,
}: {
  label: string;
  ok: boolean | undefined;
  error?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <div>
        <span className="text-sm font-medium">{label}</span>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
      <StatusIcon ok={ok} />
    </div>
  );
}

export function HealthCheckStep({ onNext, onBack, isAdvancing }: StepProps) {
  const healthCheck = useRunHealthCheck();
  const result = healthCheck.data as HealthCheckResult | undefined;

  // Auto-run health check on mount
  const runCheck = healthCheck.mutate;
  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const allCriticalPassed =
    result?.db?.ok && (result?.providers?.length ?? 0) > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Health Check</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => healthCheck.mutate()}
            disabled={healthCheck.isPending}
          >
            <RefreshCw
              className={`h-4 w-4 ${healthCheck.isPending ? "animate-spin" : ""}`}
            />
          </Button>
        </CardTitle>
        <CardDescription>
          Verifying your setup is working correctly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border divide-y">
          <CheckRow
            label="Database"
            ok={result?.db?.ok}
            error={result?.db?.error}
          />
          <CheckRow
            label="Document Processing (Docling)"
            ok={result?.docling?.ok}
            error={
              result?.docling?.ok === false
                ? result.docling.error ||
                  "Docling is not reachable. Document processing will be unavailable."
                : undefined
            }
          />
          {result?.providers?.map((p) => (
            <CheckRow
              key={p.id}
              label={`Provider: ${p.name}`}
              ok={p.ok}
              error={p.error}
            />
          ))}
          <CheckRow
            label="Backend Model Selected"
            ok={
              result?.modelSelections
                ? !!result.modelSelections.backend
                : undefined
            }
          />
          <CheckRow
            label="Workers Model Selected"
            ok={
              result?.modelSelections
                ? !!result.modelSelections.workers
                : undefined
            }
          />
        </div>

        {result && !result.docling?.ok && (
          <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Docling is optional but recommended. Without it, document
              extraction (PDF, DOCX, etc.) won't work. You can set it up later.
            </p>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={() => onNext()}
            disabled={isAdvancing || healthCheck.isPending}
          >
            {allCriticalPassed ? "Continue" : "Continue Anyway"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
