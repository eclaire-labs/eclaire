
import {
  CheckIcon,
  CopyIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/components/ui/use-toast";
import { useApiKeys } from "@/hooks/use-api-keys";

export default function ApiKeyManager() {
  const {
    apiKeys,
    isLoading,
    error,
    createApiKey,
    deleteApiKey,
    updateApiKey,
  } = useApiKeys();
  const [copied, setCopied] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [editKeyName, setEditKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<{
    key: string;
    displayKey: string;
    name: string;
  } | null>(null);
  const { toast } = useToast();

  const handleCopyKey = (key: string) => {
    navigator.clipboard
      .writeText(key)
      .then(() => {
        setCopied(key);
        toast({
          title: "API Key copied",
          description: "The API key has been copied to your clipboard.",
        });
        setTimeout(() => setCopied(null), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy API key:", err);
        toast({
          variant: "destructive",
          title: "Failed to copy",
          description: "Could not copy the API key to clipboard.",
        });
      });
  };

  const handleCreateKey = async () => {
    const name = newKeyName.trim() || undefined;
    const result = await createApiKey(name);
    if (result) {
      setCreatedKey(result);
      setNewKeyName("");
      setShowCreateDialog(false);
      toast({
        title: "API Key created",
        description:
          "Your new API key has been created. Make sure to copy it now.",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Failed to create API key",
        description: "Could not create the API key. Please try again.",
      });
    }
  };

  const handleDeleteKey = async (id: string) => {
    const success = await deleteApiKey(id);
    if (success) {
      toast({
        title: "API Key deleted",
        description: "The API key has been deleted successfully.",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Failed to delete API key",
        description: "Could not delete the API key. Please try again.",
      });
    }
    setShowDeleteDialog(null);
  };

  const handleUpdateKey = async (id: string) => {
    if (!editKeyName.trim()) {
      toast({
        variant: "destructive",
        title: "Invalid name",
        description: "API key name cannot be empty.",
      });
      return;
    }

    const success = await updateApiKey(id, editKeyName.trim());
    if (success) {
      toast({
        title: "API Key updated",
        description: "The API key name has been updated successfully.",
      });
      setShowEditDialog(null);
      setEditKeyName("");
    } else {
      toast({
        variant: "destructive",
        title: "Failed to update API key",
        description: "Could not update the API key name. Please try again.",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="w-full space-y-6">
      {/* Show newly created key */}
      {createdKey && (
        <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950">
          <h3 className="font-semibold text-sm mb-2">
            New API Key Created: {createdKey.name}
          </h3>
          <div className="flex space-x-2 mb-2">
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
              title="Copy API Key"
            >
              {copied === createdKey.key ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                <CopyIcon className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            This is the only time you will see the full API key. Make sure to
            copy it now.
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

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">API Keys</h3>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <PlusIcon className="h-4 w-4" />
              Create New Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New API Key</DialogTitle>
              <DialogDescription>
                Create a new API key for accessing the API. You can optionally
                provide a name to help identify this key.
              </DialogDescription>
            </DialogHeader>
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="key-name">Name (optional)</Label>
              <Input
                id="key-name"
                placeholder="e.g., Production App, Development"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewKeyName("");
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
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : error ? (
        <div className="text-destructive p-4 border rounded-lg">
          Error loading API keys: {error.message}
        </div>
      ) : apiKeys.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No API keys found. Create your first API key to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apiKeys.map((key) => (
            <div key={key.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{key.name}</h4>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => {
                        setEditKeyName(key.name);
                        setShowEditDialog(key.id);
                      }}
                    >
                      <EditIcon className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex space-x-2">
                    <Input
                      type="text"
                      value={key.displayKey}
                      readOnly
                      className="font-mono text-xs w-64"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => handleCopyKey(key.displayKey)}
                      title="Copy Display Key"
                      className="h-8"
                    >
                      {copied === key.displayKey ? (
                        <CheckIcon className="h-4 w-4" />
                      ) : (
                        <CopyIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created: {formatDate(key.createdAt)}
                    {key.lastUsedAt &&
                      ` • Last used: ${formatDate(key.lastUsedAt)}`}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setShowDeleteDialog(key.id)}
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-sm text-muted-foreground border rounded-lg p-4">
        <p className="font-medium mb-2">Security Notes:</p>
        <ul className="space-y-1 text-xs">
          <li>• API keys are only shown in full when first created</li>
          <li>• Store your keys securely and never share them</li>
          <li>• You can delete and recreate keys at any time</li>
          <li>• Each key can be used independently</li>
        </ul>
      </div>

      {/* Edit Dialog */}
      <Dialog
        open={!!showEditDialog}
        onOpenChange={(open) => !open && setShowEditDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit API Key Name</DialogTitle>
            <DialogDescription>
              Update the name of this API key to help you identify it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid w-full items-center gap-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={editKeyName}
              onChange={(e) => setEditKeyName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditDialog(null);
                setEditKeyName("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => showEditDialog && handleUpdateKey(showEditDialog)}
              disabled={isLoading}
            >
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog
        open={!!showDeleteDialog}
        onOpenChange={(open) => !open && setShowDeleteDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this API key? This action cannot
              be undone and any applications using this key will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                showDeleteDialog && handleDeleteKey(showDeleteDialog)
              }
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
