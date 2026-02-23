import {
  ArrowLeftRight,
  Bell,
  MessageSquare,
  MoreHorizontal,
  Settings,
  TestTube,
  Trash2,
  Zap,
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
import { Switch } from "@/components/ui/switch";
import { type Channel, useChannels } from "@/hooks/use-channels";

interface ChannelCardProps {
  channel: Channel;
  onEdit: (channel: Channel) => void;
}

// Platform icons and colors
const platformConfig = {
  telegram: {
    icon: "📱",
    color: "bg-blue-500",
    name: "Telegram",
  },
  slack: {
    icon: "💬",
    color: "bg-purple-500",
    name: "Slack",
  },
  whatsapp: {
    icon: "💚",
    color: "bg-green-500",
    name: "WhatsApp",
  },
  email: {
    icon: "📧",
    color: "bg-orange-500",
    name: "Email",
  },
} as const;

// Capability icons and descriptions
const capabilityConfig = {
  notification: {
    icon: Bell,
    label: "Send Only",
    description: "Can send notifications",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  },
  chat: {
    icon: MessageSquare,
    label: "Receive Only",
    description: "Can receive and respond to messages",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  },
  bidirectional: {
    icon: ArrowLeftRight,
    label: "Bidirectional",
    description: "Can send and receive messages",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  },
} as const;

export default function ChannelCard({ channel, onEdit }: ChannelCardProps) {
  const {
    updateChannel,
    deleteChannel,
    testConnection,
    isUpdating,
    isDeleting,
    isTesting,
  } = useChannels();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const platformInfo = platformConfig[channel.platform];
  const capabilityInfo = capabilityConfig[channel.capability];
  const CapabilityIcon = capabilityInfo.icon;

  const handleToggleActive = async (isActive: boolean) => {
    setIsToggling(true);
    try {
      await updateChannel(channel.id, { isActive });
    } catch (_error) {
      // Error is handled by the hook
    } finally {
      setIsToggling(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      await testConnection(channel.id);
      // Success toast is handled by the hook
    } catch (error) {
      // Error is handled by the hook, but we can add additional context
      console.error("Test connection failed:", error);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteChannel(channel.id);
      setShowDeleteDialog(false);
    } catch (_error) {
      // Error is handled by the hook
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <>
      <Card
        className={`transition-all duration-200 ${channel.isActive ? "" : "opacity-60"}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg ${platformInfo.color} flex items-center justify-center text-white text-sm font-medium`}
              >
                {platformInfo.icon}
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base truncate">
                  {channel.name}
                </CardTitle>
                <CardDescription className="text-sm">
                  {platformInfo.name} • Created {formatDate(channel.createdAt)}
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={channel.isActive}
                onCheckedChange={handleToggleActive}
                disabled={isUpdating || isToggling}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(channel)}>
                    <Settings className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleTestConnection}
                    disabled={!channel.isActive || isTesting}
                  >
                    <TestTube className="mr-2 h-4 w-4" />
                    {isTesting ? "Testing..." : "Test Connection"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className={capabilityInfo.color}>
                <CapabilityIcon className="mr-1 h-3 w-3" />
                {capabilityInfo.label}
              </Badge>
              {!channel.isActive && (
                <Badge variant="outline" className="text-muted-foreground">
                  <Zap className="mr-1 h-3 w-3" />
                  Inactive
                </Badge>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              {capabilityInfo.description}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Channel</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{channel.name}"? This action
              cannot be undone and you will no longer receive notifications
              through this channel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
