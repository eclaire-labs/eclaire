import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  AccessLevelInfo,
  AdminAccessLevel,
  DataAccessLevel,
} from "@/lib/api-actors";

import type { ApiKeyFormValues } from "./CreateApiKeyDialog";
import { PermissionSelectors } from "./PermissionSelectors";

interface EditApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  isLoading: boolean;
  dataAccessLevels: Record<DataAccessLevel, AccessLevelInfo>;
  adminAccessLevels: Record<AdminAccessLevel, AccessLevelInfo>;
  initialName: string;
  initialDataAccess: DataAccessLevel;
  initialAdminAccess: AdminAccessLevel;
  onSubmit: (values: ApiKeyFormValues) => void;
}

export function EditApiKeyDialog({
  open,
  onOpenChange,
  isAdmin,
  isLoading,
  dataAccessLevels,
  adminAccessLevels,
  initialName,
  initialDataAccess,
  initialAdminAccess,
  onSubmit,
}: EditApiKeyDialogProps) {
  const [editKeyName, setEditKeyName] = useState("");
  const [editKeyDataAccess, setEditKeyDataAccess] =
    useState<DataAccessLevel>("read");
  const [editKeyAdminAccess, setEditKeyAdminAccess] =
    useState<AdminAccessLevel>("none");

  // Seed form state from the target key whenever the dialog is (re)opened
  useEffect(() => {
    if (open) {
      setEditKeyName(initialName);
      setEditKeyDataAccess(initialDataAccess);
      setEditKeyAdminAccess(initialAdminAccess);
    }
  }, [open, initialName, initialDataAccess, initialAdminAccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit API Key</DialogTitle>
          <DialogDescription>
            Update the key name and permission level.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-key-name">Name</Label>
            <Input
              id="edit-key-name"
              value={editKeyName}
              onChange={(event) => setEditKeyName(event.target.value)}
            />
          </div>
          <PermissionSelectors
            prefix="edit"
            isAdmin={isAdmin}
            dataAccessLevels={dataAccessLevels}
            adminAccessLevels={adminAccessLevels}
            dataAccess={editKeyDataAccess}
            onDataAccessChange={setEditKeyDataAccess}
            adminAccess={editKeyAdminAccess}
            onAdminAccessChange={setEditKeyAdminAccess}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                name: editKeyName,
                dataAccess: editKeyDataAccess,
                adminAccess: editKeyAdminAccess,
              })
            }
            disabled={isLoading}
          >
            Update Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
