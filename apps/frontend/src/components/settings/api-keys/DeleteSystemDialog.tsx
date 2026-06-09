import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteSystemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemName: string | undefined;
  onConfirm: () => void;
}

export function DeleteSystemDialog({
  open,
  onOpenChange,
  systemName,
  onConfirm,
}: DeleteSystemDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete External System</AlertDialogTitle>
          <AlertDialogDescription>
            Delete {systemName}? This removes the actor and any API keys issued
            for it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Delete System
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
