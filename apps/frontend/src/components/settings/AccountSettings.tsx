import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Database, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/frontend-api";

const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(8, {
      message: "Password must be at least 8 characters.",
    }),
    newPassword: z.string().min(8, {
      message: "Password must be at least 8 characters.",
    }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const deleteAccountFormSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

const deleteAllDataFormSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

type PasswordFormValues = z.infer<typeof passwordFormSchema>;
type DeleteAccountFormValues = z.infer<typeof deleteAccountFormSchema>;
type DeleteAllDataFormValues = z.infer<typeof deleteAllDataFormSchema>;

export default function AccountSettings() {
  const { data: session, isPending: isLoading, error } = useAuth();
  const { toast } = useToast();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleteAllDataDialogOpen, setIsDeleteAllDataDialogOpen] =
    useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Handle hydration to prevent SSR/client mismatches
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const user = session?.user;

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const deleteAccountForm = useForm<DeleteAccountFormValues>({
    resolver: zodResolver(deleteAccountFormSchema),
    defaultValues: {
      password: "",
    },
  });

  const deleteAllDataForm = useForm<DeleteAllDataFormValues>({
    resolver: zodResolver(deleteAllDataFormSchema),
    defaultValues: {
      password: "",
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async (values: PasswordFormValues) => {
      const res = await apiFetch("/api/user/password", {
        method: "PUT",
        body: JSON.stringify(values),
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Password updated",
        description: "Your password has been updated successfully.",
      });
      passwordForm.reset();
    },
    onError: (error) => {
      toast({
        title: "Failed to update password",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (values: DeleteAccountFormValues) => {
      const res = await apiFetch("/api/user/delete", {
        method: "POST",
        body: JSON.stringify(values),
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Account deleted",
        description:
          "Your account has been marked for deletion. Logging out now.",
      });
      setIsDeleteDialogOpen(false);
      // Logout after a short delay
      setTimeout(() => {
        // TODO: Replace with proper logout from Better Auth
        window.location.href = "/auth/login";
      }, 1500);
    },
    onError: (error) => {
      toast({
        title: "Failed to delete account",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteAllDataMutation = useMutation({
    mutationFn: async (values: DeleteAllDataFormValues) => {
      const res = await apiFetch("/api/user/delete-all-data", {
        method: "POST",
        body: JSON.stringify(values),
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "All data deleted",
        description:
          data.message ||
          "All your data has been successfully deleted. Your account remains active.",
      });
      setIsDeleteAllDataDialogOpen(false);
      deleteAllDataForm.reset();
      // Optionally refresh the page or redirect to show the clean state
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    },
    onError: (error) => {
      toast({
        title: "Failed to delete data",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function onPasswordSubmit(values: PasswordFormValues) {
    updatePasswordMutation.mutate(values);
  }

  function onDeleteSubmit(values: DeleteAccountFormValues) {
    deleteAccountMutation.mutate(values);
  }

  function onDeleteAllDataSubmit(values: DeleteAllDataFormValues) {
    deleteAllDataMutation.mutate(values);
  }

  // Show loading state until hydration is complete and during auth loading
  if (!isHydrated || isLoading) {
    return (
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Account Settings</CardTitle>
            <CardDescription>
              Loading your account information...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded mt-4"></div>
                <div className="h-4 bg-gray-200 rounded mt-2"></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Only show error state after hydration is complete
  if (error) {
    return (
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Account Settings</CardTitle>
            <CardDescription>Error loading account information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-red-500">
              Error loading account: {error.message || "Unknown error"}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Account Settings</CardTitle>
            <CardDescription>
              Please log in to access account settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-gray-500">
              Please log in to view your account settings.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Change your account password.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm}>
            <form
              onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
              className="space-y-6"
            >
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Current password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="New password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Confirm new password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={updatePasswordMutation.isPending}>
                {updatePasswordMutation.isPending
                  ? "Updating..."
                  : "Update Password"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Delete All Data */}
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-destructive">
                Delete All Data
              </h4>
              <p className="text-sm text-muted-foreground">
                Remove all your content (bookmarks, documents, photos, notes,
                tasks) while keeping your account active.
              </p>
            </div>
            <Dialog
              open={isDeleteAllDataDialogOpen}
              onOpenChange={setIsDeleteAllDataDialogOpen}
            >
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                >
                  <Database className="mr-2 h-4 w-4" />
                  Delete All Data
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete All Data</DialogTitle>
                  <DialogDescription>
                    This will permanently delete all your data including
                    bookmarks, documents, photos, notes, and tasks. Your account
                    will remain active but all content will be removed. This
                    action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <Form {...deleteAllDataForm}>
                  <form
                    onSubmit={deleteAllDataForm.handleSubmit(
                      onDeleteAllDataSubmit,
                    )}
                    className="space-y-4"
                  >
                    <FormField
                      control={deleteAllDataForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Enter your password to confirm"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Enter your current password to confirm data
                            deletion.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsDeleteAllDataDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="destructive"
                        disabled={deleteAllDataMutation.isPending}
                      >
                        {deleteAllDataMutation.isPending
                          ? "Deleting..."
                          : "Delete All Data"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Delete Account */}
          <div className="space-y-4 pt-4 border-t border-destructive/20">
            <div>
              <h4 className="text-sm font-medium text-destructive">
                Delete Account
              </h4>
              <p className="text-sm text-muted-foreground">
                Permanently delete your account and all associated data.
              </p>
            </div>
            <Dialog
              open={isDeleteDialogOpen}
              onOpenChange={setIsDeleteDialogOpen}
            >
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Account
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Account</DialogTitle>
                  <DialogDescription>
                    This action cannot be undone. This will permanently delete
                    your account and remove all your data from our servers.
                  </DialogDescription>
                </DialogHeader>
                <Form {...deleteAccountForm}>
                  <form
                    onSubmit={deleteAccountForm.handleSubmit(onDeleteSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={deleteAccountForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Enter your password to confirm"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Enter your current password to confirm account
                            deletion.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsDeleteDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="destructive"
                        disabled={deleteAccountMutation.isPending}
                      >
                        {deleteAccountMutation.isPending
                          ? "Deleting..."
                          : "Delete Account"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
