import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { AvatarColorPicker } from "@/components/ui/avatar-color-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/frontend-api";
import { COUNTRIES, getUserTimezone, TIMEZONES } from "@/lib/location-data";
import type { User } from "@/types/user";

// This schema MUST match the backend validation schema
const profileFormSchema = z.object({
  displayName: z
    .string()
    .min(2, { message: "Display name must be at least 2 characters." })
    .max(50)
    .optional()
    .or(z.literal("")),
  fullName: z.string().max(100).optional().or(z.literal("")),
  avatarColor: z.string().optional().or(z.literal("")),
  bio: z.string().max(500).optional().or(z.literal("")),
  timezone: z.string().max(50).optional().or(z.literal("")),
  city: z.string().max(50).optional().or(z.literal("")),
  country: z.string().max(50).optional().or(z.literal("")),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfileSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isHydrated, setIsHydrated] = useState(false);

  // Handle hydration to prevent SSR/client mismatches
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Direct query to /api/user for user profile data
  const {
    data: user,
    isPending: isLoading,
    error,
  } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const response = await apiFetch("/api/user");
      if (!response.ok) {
        throw new Error("Failed to fetch user profile");
      }
      const data = await response.json();
      return data.user as User;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry on 401 errors
      if (error instanceof Error && error.message.includes("401")) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    // Initialize with empty strings to prevent uncontrolled component errors
    defaultValues: {
      displayName: "",
      fullName: "",
      avatarColor: "",
      bio: "",
      timezone: "",
      city: "",
      country: "",
    },
  });

  // Use useEffect to populate the form once the user data is available
  useEffect(() => {
    if (user) {
      form.reset({
        displayName: user.displayName || "",
        fullName: user.fullName || "",
        avatarColor: user.avatarColor || "",
        bio: user.bio || "",
        timezone: user.timezone || getUserTimezone(), // Auto-detect timezone if not set
        city: user.city || "",
        country: user.country || "",
      });
    }
  }, [user, form]);

  // Avatar upload state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Color change confirmation state
  const [showColorConfirmDialog, setShowColorConfirmDialog] = useState(false);
  const [pendingColorChange, setPendingColorChange] = useState<string>("");

  // Avatar upload mutation
  const avatarUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("avatar", file);

      const response = await apiFetch("/api/user/avatar", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to upload avatar");
      }

      return response.json();
    },
    onSuccess: () => {
      // Refresh user profile data to show new avatar
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      // Clear upload state
      setAvatarFile(null);
      setAvatarPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      toast({
        title: "Avatar updated",
        description: "Your profile picture has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update avatar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Avatar delete mutation
  const avatarDeleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch("/api/user/avatar", {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to remove avatar");
      }

      return response.json();
    },
    onSuccess: () => {
      // Refresh user profile data to remove avatar
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      toast({
        title: "Avatar removed",
        description: "Your profile picture has been removed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove avatar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (values: ProfileFormValues) => {
      const res = await apiFetch("/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update profile");
      }
      return res.json() as Promise<User>;
    },
    onSuccess: (updatedUser) => {
      // Update the user profile cache with the updated user data
      queryClient.setQueryData(["user-profile"], updatedUser);
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update profile",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle file selection
  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file.",
          variant: "destructive",
        });
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        // 5MB limit
        toast({
          title: "File too large",
          description: "Please select an image smaller than 5MB.",
          variant: "destructive",
        });
        return;
      }

      setAvatarFile(file);

      // Create preview URL
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    },
    [toast],
  );

  // Handle drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Handle color change with confirmation if avatar exists
  const handleColorChange = useCallback(
    (color: string) => {
      if (user?.avatarUrl) {
        // User has uploaded photo, show confirmation dialog
        setPendingColorChange(color);
        setShowColorConfirmDialog(true);
      } else {
        // No uploaded photo, change color immediately and save
        form.setValue("avatarColor", color);
        // Auto-submit to save the color change
        updateProfileMutation.mutate({ avatarColor: color });
      }
    },
    [user?.avatarUrl, form, updateProfileMutation],
  );

  // Confirm color change and remove avatar
  const confirmColorChange = useCallback(async () => {
    try {
      // Remove avatar first
      await avatarDeleteMutation.mutateAsync();
      // Then set the new color and save it
      form.setValue("avatarColor", pendingColorChange);
      await updateProfileMutation.mutateAsync({
        avatarColor: pendingColorChange,
      });
      setShowColorConfirmDialog(false);
      setPendingColorChange("");
    } catch (error) {
      // Error handled by mutation's onError
      setShowColorConfirmDialog(false);
      setPendingColorChange("");
    }
  }, [avatarDeleteMutation, form, pendingColorChange, updateProfileMutation]);

  function onSubmit(values: ProfileFormValues) {
    updateProfileMutation.mutate(values);
  }

  // --- Guards for loading, error, and undefined user ---

  // Show loading state until hydration is complete and during auth loading
  if (!isHydrated || isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Loading your profile information...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="flex items-center gap-4 animate-pulse">
            <div className="h-16 w-16 rounded-full bg-muted"></div>
            <div className="space-y-2">
              <div className="h-5 w-32 rounded bg-muted"></div>
              <div className="h-4 w-48 rounded bg-muted"></div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-10 w-full rounded bg-muted"></div>
            <div className="h-10 w-full rounded bg-muted"></div>
            <div className="h-24 w-full rounded bg-muted"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Only show error state after hydration is complete
  if (error || !user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Manage your public profile information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-destructive">
            {error
              ? `Error: ${error.message}`
              : "Could not load user profile. Please try logging in again."}
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Main Component Render (user is guaranteed to be defined here) ---

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          This information helps the AI personalize your experience.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="relative">
              <UserAvatar
                user={{
                  ...user,
                  avatarColor:
                    form.watch("avatarColor") || user.avatarColor || undefined,
                }}
                size="lg"
              />
              {user.avatarUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 border-2 border-muted-foreground/20 bg-background hover:bg-muted hover:border-muted-foreground/40"
                  onClick={() => avatarDeleteMutation.mutate()}
                  disabled={avatarDeleteMutation.isPending}
                  title="Remove profile picture"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </Button>
              )}
            </div>
            <div>
              <h3 className="text-lg font-medium">
                {user.displayName || "User"}
              </h3>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              {user.avatarUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => avatarDeleteMutation.mutate()}
                  disabled={avatarDeleteMutation.isPending}
                >
                  {avatarDeleteMutation.isPending
                    ? "Removing..."
                    : "Remove Photo"}
                </Button>
              )}
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Matt" {...field} />
                      </FormControl>
                      <FormDescription>
                        How the AI will greet you.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Matt Smith" {...field} />
                      </FormControl>
                      <FormDescription>
                        Used for forms and official documents.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Avatar Upload Section */}
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Profile Picture
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Upload a profile picture or choose a color for your avatar
                  </p>
                </div>

                {/* Upload Area */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-muted-foreground/50 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                    className="hidden"
                  />

                  {avatarPreview ? (
                    <div className="space-y-4">
                      <div className="flex justify-center">
                        <img
                          src={avatarPreview}
                          alt="Avatar preview"
                          className="w-24 h-24 rounded-full object-cover"
                        />
                      </div>
                      <div className="flex gap-2 justify-center">
                        <Button
                          type="button"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (avatarFile)
                              avatarUploadMutation.mutate(avatarFile);
                          }}
                          disabled={avatarUploadMutation.isPending}
                        >
                          {avatarUploadMutation.isPending
                            ? "Uploading..."
                            : "Upload"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAvatarFile(null);
                            setAvatarPreview(null);
                            if (fileInputRef.current)
                              fileInputRef.current.value = "";
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                      <p className="text-sm font-medium">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PNG, JPG, GIF up to 5MB
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <FormField
                control={form.control}
                name="avatarColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Avatar Color</FormLabel>
                    <FormControl>
                      <AvatarColorPicker
                        selectedColor={field.value || ""}
                        onColorChange={handleColorChange}
                      />
                    </FormControl>
                    <FormDescription>
                      Choose a color for your avatar background when no profile
                      picture is set
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Tell us a little about yourself..."
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      This helps the AI understand your background and
                      interests.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timezone</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select timezone..." />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormDescription>
                      Used for scheduling and time-based features.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select country..." />
                          </SelectTrigger>
                          <SelectContent>
                            {COUNTRIES.map((country) => (
                              <SelectItem
                                key={country.value}
                                value={country.value}
                              >
                                {country.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., New York" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button type="submit" disabled={updateProfileMutation.isPending}>
                {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </Form>
        </div>
      </CardContent>

      {/* Color change confirmation dialog */}
      <AlertDialog
        open={showColorConfirmDialog}
        onOpenChange={setShowColorConfirmDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Profile Picture?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove your uploaded profile picture and use the
              selected color instead. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowColorConfirmDialog(false);
                setPendingColorChange("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmColorChange}
              disabled={avatarDeleteMutation.isPending}
            >
              {avatarDeleteMutation.isPending
                ? "Removing..."
                : "Remove Photo & Use Color"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
