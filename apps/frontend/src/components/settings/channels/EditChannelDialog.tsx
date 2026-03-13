import { DEFAULT_AGENT_ACTOR_ID } from "@eclaire/api-types";
import { PLATFORM_METADATA } from "@eclaire/api-types/channels";
import { useEffect, useState } from "react";
import { ActorPicker } from "@/components/shared/ActorPicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useActors } from "@/hooks/use-actors";
import {
  type Channel,
  type SlackConfig,
  type TelegramConfig,
  useChannels,
} from "@/hooks/use-channels";
import SlackChannelForm from "./SlackChannelForm";
import TelegramChannelForm from "./TelegramChannelForm";

interface EditChannelDialogProps {
  channel: Channel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditChannelDialog({
  channel,
  open,
  onOpenChange,
}: EditChannelDialogProps) {
  const { updateChannel, isUpdating } = useChannels();
  const [config, setConfig] = useState<TelegramConfig | SlackConfig | null>(
    null,
  );
  const [selectedAgentId, setSelectedAgentId] = useState<string>(
    DEFAULT_AGENT_ACTOR_ID,
  );
  const { actors: availableAgents } = useActors(["agent"]);

  // Fetch current config when dialog opens (we need to get the decrypted config)
  useEffect(() => {
    if (open && channel) {
      // Since the API doesn't return the config for security reasons,
      // we'll show empty fields and let the user re-enter their configuration if they want to update it.
      if (channel.platform === "telegram") {
        setConfig({ chat_identifier: "", bot_token: "" });
      } else if (channel.platform === "slack") {
        setConfig({ bot_token: "", app_token: "", channel_id: "" });
      } else {
        setConfig(null);
      }

      setSelectedAgentId(channel.agentActorId || DEFAULT_AGENT_ACTOR_ID);
    } else {
      setConfig(null);
    }
  }, [open, channel]);

  const handleUpdateChannel = async (data: {
    name: string;
    capability: Channel["capability"];
    config:
      | TelegramConfig
      | Partial<TelegramConfig>
      | SlackConfig
      | Partial<SlackConfig>;
  }) => {
    if (!channel) return;

    try {
      await updateChannel(channel.id, {
        name: data.name,
        capability: data.capability,
        agentActorId:
          data.capability === "notification" ? null : selectedAgentId,
        config: data.config,
      });

      // Close dialog on success
      onOpenChange(false);
    } catch (error) {
      // Error handling is done in the hook
      console.error("Failed to update channel:", error);
    }
  };

  const renderPlatformForm = () => {
    if (!channel) return null;

    const agentSelect = (
      <div className="space-y-2">
        <Label htmlFor="edit-channel-agent">Channel Agent</Label>
        <ActorPicker
          id="edit-channel-agent"
          actors={availableAgents}
          value={selectedAgentId}
          placeholder="Search channel agents"
          searchPlaceholder="Search channel agents..."
          onChange={(value) => {
            if (value) {
              setSelectedAgentId(value);
            }
          }}
        />
      </div>
    );

    switch (channel.platform) {
      case "telegram":
        return (
          <TelegramChannelForm
            initialData={{
              name: channel.name,
              capability: channel.capability,
              config: (config as TelegramConfig) || undefined,
            }}
            onSubmit={handleUpdateChannel}
            isSubmitting={isUpdating}
            isEditing={true}
            renderExtraFields={agentSelect}
          />
        );
      case "slack":
        return (
          <SlackChannelForm
            initialData={{
              name: channel.name,
              capability: channel.capability,
              config: (config as SlackConfig) || undefined,
            }}
            onSubmit={handleUpdateChannel}
            isSubmitting={isUpdating}
            isEditing={true}
            renderExtraFields={agentSelect}
          />
        );
      default:
        return (
          <div className="text-center py-8 text-muted-foreground">
            Editing for this platform is not yet supported.
          </div>
        );
    }
  };

  if (!channel) return null;

  const platform = PLATFORM_METADATA[channel.platform];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-base">{platform.icon}</span>
            Edit {platform.displayName} Channel
          </DialogTitle>
          <DialogDescription>
            Update your {platform.displayName} channel configuration and
            assigned agent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">{renderPlatformForm()}</div>
      </DialogContent>
    </Dialog>
  );
}
