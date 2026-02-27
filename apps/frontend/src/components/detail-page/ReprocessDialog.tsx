import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ReprocessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  description?: string;
  isReprocessing: boolean;
  onConfirm: () => void;
}

export function ReprocessDialog({
  open,
  onOpenChange,
  label,
  description,
  isReprocessing,
  onConfirm,
}: ReprocessDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reprocess {label}</DialogTitle>
          <DialogDescription>
            {description ||
              `This will reprocess all AI-generated data for this ${label.toLowerCase()}. This may take a few minutes.`}
            <br />
            <br />
            Are you sure you want to continue?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isReprocessing}
            className="flex items-center gap-2"
          >
            {isReprocessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Reprocessing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Reprocess
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
