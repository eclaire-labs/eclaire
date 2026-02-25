import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityName: string;
  itemTitle: string | null;
  onConfirm: () => void;
  isDeleting?: boolean;
  /** Optional extra content shown between the description and footer. */
  children?: React.ReactNode;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  entityName,
  itemTitle,
  onConfirm,
  isDeleting,
  children,
}: DeleteConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Deletion</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this {entityName}? This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {itemTitle && (
          <div className="my-4 p-3 border rounded-md bg-muted/50">
            <p className="font-medium break-words line-clamp-2 leading-tight">
              {itemTitle}
            </p>
          </div>
        )}
        {children}
        <DialogFooter className="sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete {entityName.charAt(0).toUpperCase() + entityName.slice(1)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
