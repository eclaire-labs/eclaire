import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  label: string;
}

interface SetupProgressProps {
  steps: Step[];
  currentIndex: number;
  completedSteps: string[];
}

export function SetupProgress({
  steps,
  currentIndex,
  completedSteps,
}: SetupProgressProps) {
  return (
    <nav aria-label="Setup progress">
      <ol className="flex items-center gap-2 overflow-x-auto">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = index === currentIndex;

          return (
            <li key={step.id} className="flex items-center gap-2">
              {index > 0 && (
                <div
                  className={cn(
                    "h-px w-4 shrink-0",
                    isCompleted || isCurrent
                      ? "bg-primary"
                      : "bg-muted-foreground/30",
                  )}
                />
              )}
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors",
                    isCompleted && "bg-primary text-primary-foreground",
                    isCurrent &&
                      !isCompleted &&
                      "border-2 border-primary text-primary",
                    !isCompleted &&
                      !isCurrent &&
                      "border border-muted-foreground/30 text-muted-foreground/50",
                  )}
                >
                  {isCompleted ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </div>
                <span
                  className={cn(
                    "text-xs hidden sm:inline",
                    isCurrent
                      ? "font-medium text-foreground"
                      : isCompleted
                        ? "text-muted-foreground"
                        : "text-muted-foreground/50",
                  )}
                >
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
