import { Loader2 } from "lucide-react";
import { Suspense } from "react";
import ProcessingContent from "./ProcessingContent";

export default function ProcessingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading processing jobs...
        </div>
      }
    >
      <ProcessingContent />
    </Suspense>
  );
}
