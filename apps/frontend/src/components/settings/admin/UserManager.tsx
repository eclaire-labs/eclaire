import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { apiGet, apiPatch } from "@/lib/api-client";

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  isInstanceAdmin: boolean;
  createdAt: string;
}

interface InstanceSettings {
  "instance.registrationEnabled"?: boolean;
  [key: string]: unknown;
}

export default function UserManager() {
  const { data: authData } = useAuth();
  const currentUserId = authData?.user?.id;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<InstanceSettings>({});

  // Confirmation dialog state
  const [pendingRole, setPendingRole] = useState<{
    userId: string;
    email: string;
    isAdmin: boolean;
  } | null>(null);

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

  const handleRoleChange = useCallback(
    async (userId: string, isAdmin: boolean) => {
      try {
        await apiPatch(`/api/admin/users/${userId}`, {
          isInstanceAdmin: isAdmin,
        });
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, isInstanceAdmin: isAdmin } : u,
          ),
        );
        toast.success(
          isAdmin ? "User promoted to admin" : "Admin role removed",
        );
      } catch {
        toast.error("Failed to update user role");
      }
      setPendingRole(null);
    },
    [],
  );

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
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[80px]">Admin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const isSelf = user.id === currentUserId;
                  return (
                    <TableRow key={user.id}>
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
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={user.isInstanceAdmin}
                          disabled={isSelf}
                          onCheckedChange={(checked) => {
                            setPendingRole({
                              userId: user.id,
                              email: user.email,
                              isAdmin: checked,
                            });
                          }}
                        />
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
        open={!!pendingRole}
        onOpenChange={(open) => !open && setPendingRole(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change user role?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRole?.isAdmin
                ? `This will grant admin privileges to ${pendingRole?.email}. They will be able to manage models, providers, users, and instance settings.`
                : `This will remove admin privileges from ${pendingRole?.email}. They will no longer be able to manage instance settings.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                pendingRole &&
                handleRoleChange(pendingRole.userId, pendingRole.isAdmin)
              }
            >
              {pendingRole?.isAdmin ? "Promote to Admin" : "Remove Admin"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
