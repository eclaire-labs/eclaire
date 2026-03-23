import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  KeyRound,
  LogOut,
  MoreHorizontal,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  isInstanceAdmin: boolean;
  accountStatus: string;
  createdAt: string;
  activeSessionCount: number;
  activeApiKeyCount: number;
}

interface InstanceSettings {
  "instance.registrationEnabled"?: boolean;
  [key: string]: unknown;
}

type PendingAction = {
  type:
    | "role"
    | "suspend"
    | "reactivate"
    | "revoke-sessions"
    | "revoke-api-keys"
    | "delete";
  userId: string;
  email: string;
  isAdmin?: boolean;
};

export default function UserManager() {
  const { data: authData } = useAuth();
  const currentUserId = authData?.user?.id;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<InstanceSettings>({});
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, settingsRes] = await Promise.all([
        apiGet("/api/admin/users"),
        apiGet("/api/admin/settings"),
      ]);
      const usersData = await usersRes.json();
      const settingsData = await settingsRes.json();
      setUsers(usersData.items ?? []);
      setSettings(settingsData);
    } catch {
      toast.error("Failed to load user data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRegistrationChange = useCallback(async (enabled: boolean) => {
    try {
      await apiPatch("/api/admin/settings", {
        "instance.registrationEnabled": enabled,
      });
      setSettings((prev) => ({
        ...prev,
        "instance.registrationEnabled": enabled,
      }));
      toast.success("Setting updated");
    } catch {
      toast.error("Failed to update setting");
    }
  }, []);

  const executeAction = useCallback(
    async (action: PendingAction) => {
      try {
        switch (action.type) {
          case "role":
            await apiPatch(`/api/admin/users/${action.userId}/role`, {
              isInstanceAdmin: action.isAdmin,
            });
            toast.success(
              action.isAdmin
                ? "User promoted to admin"
                : "Admin role removed",
            );
            break;
          case "suspend":
            await apiPost(`/api/admin/users/${action.userId}/suspend`);
            toast.success("User suspended");
            break;
          case "reactivate":
            await apiPost(`/api/admin/users/${action.userId}/reactivate`);
            toast.success("User reactivated");
            break;
          case "revoke-sessions":
            await apiPost(
              `/api/admin/users/${action.userId}/revoke-sessions`,
            );
            toast.success("All sessions revoked");
            break;
          case "revoke-api-keys":
            await apiPost(
              `/api/admin/users/${action.userId}/revoke-api-keys`,
            );
            toast.success("All API keys revoked");
            break;
          case "delete":
            await apiDelete(`/api/admin/users/${action.userId}`);
            toast.success("User deleted");
            break;
        }
        await fetchData();
      } catch {
        toast.error(`Failed to ${action.type.replace("-", " ")} user`);
      }
      setPendingAction(null);
    },
    [fetchData],
  );

  function getConfirmationMessage(action: PendingAction): string {
    switch (action.type) {
      case "role":
        return action.isAdmin
          ? `This will grant admin privileges to ${action.email}. They will be able to manage models, providers, users, and instance settings.`
          : `This will remove admin privileges from ${action.email}. They will no longer be able to manage instance settings.`;
      case "suspend":
        return `This will suspend ${action.email}. Their sessions and API keys will be immediately revoked and they will not be able to sign in.`;
      case "reactivate":
        return `This will reactivate ${action.email}. They will be able to sign in again, but their sessions and API keys will not be restored.`;
      case "revoke-sessions":
        return `This will revoke all active sessions for ${action.email}. They will be signed out everywhere.`;
      case "revoke-api-keys":
        return `This will deactivate all API keys for ${action.email}. Any integrations using their keys will stop working.`;
      case "delete":
        return `This will permanently delete the account for ${action.email} and all their data. This action cannot be undone.`;
    }
  }

  function getConfirmationTitle(action: PendingAction): string {
    switch (action.type) {
      case "role":
        return "Change user role?";
      case "suspend":
        return "Suspend user?";
      case "reactivate":
        return "Reactivate user?";
      case "revoke-sessions":
        return "Revoke all sessions?";
      case "revoke-api-keys":
        return "Revoke all API keys?";
      case "delete":
        return "Delete user?";
    }
  }

  function getConfirmButtonLabel(action: PendingAction): string {
    switch (action.type) {
      case "role":
        return action.isAdmin ? "Promote to Admin" : "Remove Admin";
      case "suspend":
        return "Suspend User";
      case "reactivate":
        return "Reactivate User";
      case "revoke-sessions":
        return "Revoke Sessions";
      case "revoke-api-keys":
        return "Revoke API Keys";
      case "delete":
        return "Delete User";
    }
  }

  return (
    <div className="space-y-6">
      {/* Registration Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Users
          </CardTitle>
          <CardDescription>
            Manage user accounts and roles for this instance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Allow new user registration</Label>
              <p className="text-xs text-muted-foreground">
                When disabled, only existing users can log in.
              </p>
            </div>
            <Switch
              checked={settings["instance.registrationEnabled"] !== false}
              onCheckedChange={handleRegistrationChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* User List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Users</CardTitle>
          <CardDescription>
            {users.length} user{users.length !== 1 ? "s" : ""} registered
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[80px]">Admin</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const isSelf = user.id === currentUserId;
                  const isSuspended = user.accountStatus === "suspended";
                  return (
                    <TableRow
                      key={user.id}
                      className={isSuspended ? "opacity-60" : undefined}
                    >
                      <TableCell>
                        <div>
                          <span className="text-sm font-medium">
                            {user.displayName || user.email}
                          </span>
                          {user.displayName && (
                            <p className="text-xs text-muted-foreground">
                              {user.email}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.isInstanceAdmin ? (
                          <Badge variant="default" className="text-xs">
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            User
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {isSuspended ? (
                          <Badge variant="destructive" className="text-xs">
                            Suspended
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-xs text-green-600 border-green-300"
                          >
                            Active
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={user.isInstanceAdmin}
                          disabled={isSelf || isSuspended}
                          onCheckedChange={(checked) => {
                            setPendingAction({
                              type: "role",
                              userId: user.id,
                              email: user.email,
                              isAdmin: checked,
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {!isSelf && !user.isInstanceAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                className="h-8 w-8 p-0"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {isSuspended ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setPendingAction({
                                      type: "reactivate",
                                      userId: user.id,
                                      email: user.email,
                                    })
                                  }
                                >
                                  <ShieldCheck className="mr-2 h-4 w-4" />
                                  Reactivate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setPendingAction({
                                      type: "suspend",
                                      userId: user.id,
                                      email: user.email,
                                    })
                                  }
                                >
                                  <Ban className="mr-2 h-4 w-4" />
                                  Suspend
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() =>
                                  setPendingAction({
                                    type: "revoke-sessions",
                                    userId: user.id,
                                    email: user.email,
                                  })
                                }
                              >
                                <LogOut className="mr-2 h-4 w-4" />
                                Revoke Sessions ({user.activeSessionCount})
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setPendingAction({
                                    type: "revoke-api-keys",
                                    userId: user.id,
                                    email: user.email,
                                  })
                                }
                              >
                                <KeyRound className="mr-2 h-4 w-4" />
                                Revoke API Keys ({user.activeApiKeyCount})
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() =>
                                  setPendingAction({
                                    type: "delete",
                                    userId: user.id,
                                    email: user.email,
                                  })
                                }
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={!!pendingAction}
        onOpenChange={(open) => !open && setPendingAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction && getConfirmationTitle(pendingAction)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction && getConfirmationMessage(pendingAction)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingAction && executeAction(pendingAction)}
              className={
                pendingAction?.type === "delete"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {pendingAction && getConfirmButtonLabel(pendingAction)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
