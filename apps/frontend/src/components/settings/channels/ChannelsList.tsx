import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type Channel, useChannels } from "@/hooks/use-channels";
import AddChannelDialog from "./AddChannelDialog";
import ChannelCard from "./ChannelCard";
import EditChannelDialog from "./EditChannelDialog";

export default function ChannelsList() {
  const { channels, total, isLoading, error, refresh } = useChannels();
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);

  const handleEdit = (channel: Channel) => {
    setEditingChannel(channel);
  };

  const handleEditClose = () => {
    setEditingChannel(null);
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Communication Channels</CardTitle>
          <CardDescription>
            Connect platforms to receive notifications and interact with your
            assistant
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load channels: {error.message}
            </AlertDescription>
          </Alert>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            className="mt-4"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Communication Channels</CardTitle>
            <CardDescription>
              Connect platforms to receive notifications and interact with your
              assistant
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={isLoading}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <AddChannelDialog />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          // Loading state
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : channels.length === 0 ? (
          // Empty state
          <div className="text-center py-12">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              No channels configured
            </h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Add your first communication channel to start receiving
              notifications and chatting with your assistant.
            </p>
            <AddChannelDialog
              trigger={
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Your First Channel
                </Button>
              }
            />
          </div>
        ) : (
          // Channels list
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {total} channel{total !== 1 ? "s" : ""} configured
              </span>
              <span>{channels.filter((c) => c.isActive).length} active</span>
            </div>

            <div className="grid gap-4">
              {channels.map((channel) => (
                <ChannelCard
                  key={channel.id}
                  channel={channel}
                  onEdit={handleEdit}
                />
              ))}
            </div>

            {/* Help text */}
            <div className="mt-8 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-2">Channel Capabilities</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                  <strong>Notify:</strong> System can push information to this
                  channel
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  <strong>Chat:</strong> Users can chat with the assistant on
                  this channel
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <strong>Both:</strong> Both notifications and chat
                  functionality
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <EditChannelDialog
        channel={editingChannel}
        open={editingChannel !== null}
        onOpenChange={handleEditClose}
      />
    </Card>
  );
}
