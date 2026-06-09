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

import { PermissionSelectors } from "./PermissionSelectors";

export interface ApiKeyFormValues {
  name: string;
  dataAccess: DataAccessLevel;
  adminAccess: AdminAccessLevel;
}

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  isLoading: boolean;
  dataAccessLevels: Record<DataAccessLevel, AccessLevelInfo>;
  adminAccessLevels: Record<AdminAccessLevel, AccessLevelInfo>;
  onSubmit: (values: ApiKeyFormValues) => void;
}

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  isAdmin,
  isLoading,
  dataAccessLevels,
  adminAccessLevels,
  onSubmit,
}: CreateApiKeyDialogProps) {
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyDataAccess, setNewKeyDataAccess] =
    useState<DataAccessLevel>("read");
  const [newKeyAdminAccess, setNewKeyAdminAccess] =
    useState<AdminAccessLevel>("none");

  // Reset form state whenever the dialog is (re)opened
  useEffect(() => {
    if (open) {
      setNewKeyName("");
      setNewKeyDataAccess("read");
      setNewKeyAdminAccess("none");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>
            Choose a name and permission level for this key.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="new-key-name">Name</Label>
            <Input
              id="new-key-name"
              placeholder="e.g., Production integration"
              value={newKeyName}
              onChange={(event) => setNewKeyName(event.target.value)}
            />
          </div>
          <PermissionSelectors
            prefix="create"
            isAdmin={isAdmin}
            dataAccessLevels={dataAccessLevels}
            adminAccessLevels={adminAccessLevels}
            dataAccess={newKeyDataAccess}
            onDataAccessChange={setNewKeyDataAccess}
            adminAccess={newKeyAdminAccess}
            onAdminAccessChange={setNewKeyAdminAccess}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                name: newKeyName,
                dataAccess: newKeyDataAccess,
                adminAccess: newKeyAdminAccess,
              })
            }
            disabled={isLoading}
          >
            Create Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
