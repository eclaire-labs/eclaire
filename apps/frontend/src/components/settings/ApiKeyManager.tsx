import {
  CheckIcon,
  ChevronDown,
  CopyIcon,
  EditIcon,
  Loader2,
  PlusIcon,
  ShieldCheck,
  TrashIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/hooks/use-auth";
import { useApiKeys } from "@/hooks/use-api-keys";
import type { AdminAccessLevel, DataAccessLevel } from "@/lib/api-actors";

function getActorKindLabel(kind: "human" | "agent" | "service" | "system") {
  switch (kind) {
    case "human":
      return "Human";
    case "agent":
      return "Agent";
    case "service":
      return "External system";
    default:
      return "System";
  }
}

function getActorDescription(kind: "human" | "agent" | "service" | "system") {
  switch (kind) {
    case "human":
      return "Use these keys for scripts and automations acting as you.";
    case "agent":
      return "These keys let external callers act as this agent inside Eclaire.";
    case "service":
      return "Externally managed systems authenticate through these keys.";
    default:
      return "System-managed actor";
  }
}

function getPermissionLabel(
  dataAccess: DataAccessLevel | null,
  adminAccess: AdminAccessLevel | null,
): string {
  if (dataAccess === null) return "Custom";
  const dataLabel = dataAccess === "read" ? "Read only" : "Read & write";
  if (!adminAccess || adminAccess === "none") return dataLabel;
  const adminLabel =
    adminAccess === "read" ? "Admin: read" : "Admin: read & write";
  return `${dataLabel} + ${adminLabel}`;
}

export default function ApiKeyManager() {
  const { data: authData } = useAuth();
  const isAdmin =
    (authData?.user as Record<string, unknown> | undefined)?.isInstanceAdmin ===
    true;

  const {
    actorGroups,
    dataAccessLevels,
    adminAccessLevels,
    isLoading,
    error,
    createApiKey,
    updateApiKey,
    deleteApiKey,
    createExternalSystem,
    deleteExternalSystem,
  } = useApiKeys();

  const [copied, setCopied] = useState<string | null>(null);
  const [createActorId, setCreateActorId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{
    actorId: string;
    keyId: string;
    isLegacy: boolean;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    actorId: string;
    keyId: string;
    name: string;
  } | null>(null);
  const [deleteSystemTarget, setDeleteSystemTarget] = useState<{
    actorId: string;
    name: string;
  } | null>(null);
  const [showCreateSystemDialog, setShowCreateSystemDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyDataAccess, setNewKeyDataAccess] =
    useState<DataAccessLevel>("read");
  const [newKeyAdminAccess, setNewKeyAdminAccess] =
    useState<AdminAccessLevel>("none");
  const [editKeyName, setEditKeyName] = useState("");
  const [editKeyDataAccess, setEditKeyDataAccess] =
    useState<DataAccessLevel>("read");
  const [editKeyAdminAccess, setEditKeyAdminAccess] =
    useState<AdminAccessLevel>("none");
  const [newSystemName, setNewSystemName] = useState("");
  const [createdKey, setCreatedKey] = useState<{
    key: string;
    displayKey: string;
    name: string;
    actorName: string;
  } | null>(null);

  const handleCopyKey = (key: string) => {
    navigator.clipboard
      .writeText(key)
      .then(() => {
        setCopied(key);
        toast.success("API key copied", {
          description: "The API key has been copied to your clipboard.",
        });
        setTimeout(() => setCopied(null), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy API key:", err);
        toast.error("Failed to copy", {
          description: "Could not copy the API key to clipboard.",
        });
      });
  };

  const handleCreateKey = async () => {
    if (!createActorId) {
      return;
    }

    const group = actorGroups.find((item) => item.actor.id === createActorId);
    const result = await createApiKey(createActorId, {
      name: newKeyName.trim() || undefined,
      dataAccess: newKeyDataAccess,
      adminAccess: newKeyAdminAccess,
    });

    if (result) {
      setCreatedKey({
        key: result.key || "",
        displayKey: result.displayKey,
        name: result.name,
        actorName: group?.actor.displayName || "Actor",
      });
      setCreateActorId(null);
      setNewKeyName("");
      setNewKeyDataAccess("read");
      setNewKeyAdminAccess("none");
      toast.success("API key created", {
        description: "Copy the full key now. It will not be shown again.",
      });
      return;
    }

    toast.error("Failed to create API key", {
      description: "Could not create the API key. Please try again.",
    });
  };

  const handleUpdateKey = async () => {
    if (!editTarget || !editKeyName.trim()) {
      toast.error("Invalid name", {
        description: "API key name cannot be empty.",
      });
      return;
    }

    const payload = editTarget.isLegacy
      ? { name: editKeyName.trim() }
      : {
          name: editKeyName.trim(),
          dataAccess: editKeyDataAccess,
          adminAccess: editKeyAdminAccess,
        };

    const success = await updateApiKey(
      editTarget.actorId,
      editTarget.keyId,
      payload,
    );

    if (success) {
      toast.success("API key updated", {
        description: "The API key has been updated successfully.",
      });
      setEditTarget(null);
      setEditKeyName("");
      return;
    }

    toast.error("Failed to update API key", {
      description: "Could not update the API key. Please try again.",
    });
  };

  const handleDeleteKey = async () => {
    if (!deleteTarget) {
      return;
    }

    const success = await deleteApiKey(
      deleteTarget.actorId,
      deleteTarget.keyId,
    );
    if (success) {
      toast.success("API key deleted", {
        description: "The API key has been deleted successfully.",
      });
    } else {
      toast.error("Failed to delete API key", {
        description: "Could not delete the API key. Please try again.",
      });
    }
    setDeleteTarget(null);
  };

  const handleCreateExternalSystem = async () => {
    if (!newSystemName.trim()) {
      toast.error("Invalid name", {
        description: "External system name cannot be empty.",
      });
      return;
    }

    const created = await createExternalSystem(newSystemName.trim());
    if (created) {
      toast.success("External system created", {
        description: "You can now mint API keys for this system.",
      });
      setNewSystemName("");
      setShowCreateSystemDialog(false);
      return;
    }

    toast.error("Failed to create external system", {
      description: "Could not create the external system actor.",
    });
  };

  const handleDeleteExternalSystem = async () => {
    if (!deleteSystemTarget) {
      return;
    }

    const success = await deleteExternalSystem(deleteSystemTarget.actorId);
    if (success) {
      toast.success("External system deleted", {
        description: "The external system actor has been removed.",
      });
    } else {
      toast.error("Failed to delete external system", {
        description: "Could not delete the external system actor.",
      });
    }
    setDeleteSystemTarget(null);
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString();

  const renderPermissionSelectors = (
    prefix: string,
    dataAccess: DataAccessLevel,
    setDataAccess: (v: DataAccessLevel) => void,
    adminAccess: AdminAccessLevel,
    setAdminAccess: (v: AdminAccessLevel) => void,
  ) => (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>Data access</Label>
        <RadioGroup
          value={dataAccess}
          onValueChange={(v) => setDataAccess(v as DataAccessLevel)}
          className="grid gap-2"
        >
          {(
            Object.entries(dataAccessLevels) as [
              DataAccessLevel,
              { label: string; description: string },
            ][]
          ).map(([value, info]) => (
            <div key={value} className="flex items-start gap-3">
              <RadioGroupItem
                value={value}
                id={`${prefix}-data-${value}`}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label
                  htmlFor={`${prefix}-data-${value}`}
                  className="cursor-pointer text-sm font-medium"
                >
                  {info.label}
                </Label>
                <div className="text-xs text-muted-foreground">
                  {info.description}
                </div>
              </div>
            </div>
          ))}
        </RadioGroup>
      </div>

      {isAdmin && (
        <div className="grid gap-2">
          <Label>Admin access</Label>
          <RadioGroup
            value={adminAccess}
            onValueChange={(v) => setAdminAccess(v as AdminAccessLevel)}
            className="grid gap-2"
          >
            {(
              Object.entries(adminAccessLevels) as [
                AdminAccessLevel,
                { label: string; description: string },
              ][]
            ).map(([value, info]) => (
              <div key={value} className="flex items-start gap-3">
                <RadioGroupItem
                  value={value}
                  id={`${prefix}-admin-${value}`}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <Label
                    htmlFor={`${prefix}-admin-${value}`}
                    className="cursor-pointer text-sm font-medium"
                  >
                    {info.label}
                  </Label>
                  <div className="text-xs text-muted-foreground">
                    {info.description}
                  </div>
                </div>
              </div>
            ))}
          </RadioGroup>
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full space-y-6">
      {createdKey && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
          <h3 className="mb-2 text-sm font-semibold">
            New API key for {createdKey.actorName}: {createdKey.name}
          </h3>
          <div className="mb-2 flex gap-2">
            <Input
              type="text"
              value={createdKey.key}
              readOnly
              className="font-mono text-xs"
            />
            <Button
              size="icon"
              variant="outline"
              onClick={() => handleCopyKey(createdKey.key)}
              title="Copy API key"
            >
              {copied === createdKey.key ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                <CopyIcon className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            This is the only time the full API key is shown.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreatedKey(null)}
          >
            Got it
          </Button>
        </div>
      )}

      <div className="flex justify-end">
        <Dialog
          open={showCreateSystemDialog}
          onOpenChange={setShowCreateSystemDialog}
        >
          <DialogTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <PlusIcon className="h-4 w-4" />
              Add External System
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create External System</DialogTitle>
              <DialogDescription>
                Create a service actor for systems like OpenClaw or internal
                automation runners.
              </DialogDescription>
            </DialogHeader>
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="service-name">Display name</Label>
              <Input
                id="service-name"
                placeholder="e.g., OpenClaw"
                value={newSystemName}
                onChange={(event) => setNewSystemName(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateSystemDialog(false);
                  setNewSystemName("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateExternalSystem} disabled={isLoading}>
                Create System
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="rounded-lg border p-4 text-destructive">
          Error loading API keys: {error.message}
        </div>
      ) : actorGroups.length === 0 ? (
        <div className="rounded-lg border py-8 text-center text-muted-foreground">
          <p>No actors available for API key management yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {actorGroups.map(({ actor, apiKeys }) => (
            <div key={actor.id} className="rounded-lg border p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">
                      {actor.displayName || "Unnamed Actor"}
                    </h4>
                    <Badge variant="outline">
                      {getActorKindLabel(actor.kind)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {getActorDescription(actor.kind)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {actor.kind === "service" && (
                    <Button
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        setDeleteSystemTarget({
                          actorId: actor.id,
                          name: actor.displayName || "External system",
                        })
                      }
                    >
                      Delete System
                    </Button>
                  )}
                  <Button
                    className="flex items-center gap-2"
                    onClick={() => {
                      setCreateActorId(actor.id);
                      setNewKeyName("");
                      setNewKeyDataAccess("read");
                      setNewKeyAdminAccess("none");
                    }}
                  >
                    <PlusIcon className="h-4 w-4" />
                    Create Key
                  </Button>
                </div>
              </div>

              {apiKeys.length === 0 ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  No API keys for this actor yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {apiKeys.map((key) => {
                    const isLegacy = key.dataAccess === null;
                    const isFullAccess =
                      key.scopes.length === 1 && key.scopes[0] === "*";
                    return (
                      <div key={key.id} className="rounded-lg border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h5 className="font-medium">{key.name}</h5>
                              {!key.isActive && (
                                <Badge variant="secondary">Inactive</Badge>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Input
                                type="text"
                                value={key.displayKey}
                                readOnly
                                className="w-64 font-mono text-xs"
                              />
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8"
                                onClick={() => handleCopyKey(key.displayKey)}
                                title="Copy display key"
                              >
                                {copied === key.displayKey ? (
                                  <CheckIcon className="h-4 w-4" />
                                ) : (
                                  <CopyIcon className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {isFullAccess ? (
                                <Badge variant="outline">
                                  Full access (legacy)
                                </Badge>
                              ) : isLegacy ? (
                                <Badge variant="outline">Custom (legacy)</Badge>
                              ) : (
                                <Badge variant="secondary">
                                  {getPermissionLabel(
                                    key.dataAccess,
                                    key.adminAccess,
                                  )}
                                </Badge>
                              )}
                            </div>
                            <Collapsible>
                              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                <ChevronDown className="h-3 w-3" />
                                {key.scopes.length} scope
                                {key.scopes.length !== 1 ? "s" : ""}
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {key.scopes.map((scope) => (
                                    <Badge
                                      key={scope}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {scope}
                                    </Badge>
                                  ))}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                            <div className="text-xs text-muted-foreground">
                              Created: {formatDate(key.createdAt)}
                              {key.lastUsedAt &&
                                ` • Last used: ${formatDate(key.lastUsedAt)}`}
                            </div>
                          </div>

                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                const keyIsLegacy = key.dataAccess === null;
                                setEditTarget({
                                  actorId: actor.id,
                                  keyId: key.id,
                                  isLegacy: keyIsLegacy,
                                });
                                setEditKeyName(key.name);
                                if (!keyIsLegacy && key.dataAccess) {
                                  setEditKeyDataAccess(key.dataAccess);
                                  setEditKeyAdminAccess(
                                    key.adminAccess ?? "none",
                                  );
                                }
                              }}
                            >
                              <EditIcon className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() =>
                                setDeleteTarget({
                                  actorId: actor.id,
                                  keyId: key.id,
                                  name: key.name,
                                })
                              }
                            >
                              <TrashIcon className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Security notes</AlertTitle>
        <AlertDescription>
          <ul className="mt-2 space-y-1 text-xs">
            <li>Full keys are only shown once when created.</li>
            <li>
              Keys act as the selected actor, not always as you personally.
            </li>
            <li>External systems should get the narrowest access they need.</li>
            <li>
              Revoke unused keys instead of sharing one credential broadly.
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Create Key Dialog */}
      <Dialog
        open={!!createActorId}
        onOpenChange={(open) => {
          if (!open) {
            setCreateActorId(null);
            setNewKeyName("");
            setNewKeyDataAccess("read");
            setNewKeyAdminAccess("none");
          }
        }}
      >
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
            {renderPermissionSelectors(
              "create",
              newKeyDataAccess,
              setNewKeyDataAccess,
              newKeyAdminAccess,
              setNewKeyAdminAccess,
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateActorId(null);
                setNewKeyName("");
                setNewKeyDataAccess("read");
                setNewKeyAdminAccess("none");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateKey} disabled={isLoading}>
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Key Dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
            setEditKeyName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit API Key</DialogTitle>
            <DialogDescription>
              {editTarget?.isLegacy
                ? "This key has custom scopes. Only the name can be edited."
                : "Update the key name and permission level."}
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
            {!editTarget?.isLegacy &&
              renderPermissionSelectors(
                "edit",
                editKeyDataAccess,
                setEditKeyDataAccess,
                editKeyAdminAccess,
                setEditKeyAdminAccess,
              )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditTarget(null);
                setEditKeyName("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateKey} disabled={isLoading}>
              Update Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Key Dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deleteTarget?.name}? Any system using this key will stop
              working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDeleteKey}
            >
              Delete Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete System Dialog */}
      <AlertDialog
        open={!!deleteSystemTarget}
        onOpenChange={(open) => !open && setDeleteSystemTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete External System</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deleteSystemTarget?.name}? This removes the actor and any
              API keys issued for it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDeleteExternalSystem}
            >
              Delete System
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
