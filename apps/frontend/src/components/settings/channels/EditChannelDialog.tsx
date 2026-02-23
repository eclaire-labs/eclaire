import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type Channel,
  type TelegramConfig,
  useChannels,
} from "@/hooks/use-channels";
import TelegramChannelForm from "./TelegramChannelForm";

interface EditChannelDialogProps {
  channel: Channel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const platformInfo = {
  telegram: {
    name: "Telegram",
    icon: "📱",
  },
  slack: {
    name: "Slack",
    icon: "💬",
  },
  whatsapp: {
    name: "WhatsApp",
    icon: "💚",
  },
  email: {
    name: "Email",
    icon: "📧",
  },
} as const;

export default function EditChannelDialog({
  channel,
  open,
  onOpenChange,
}: EditChannelDialogProps) {
  const { updateChannel, isUpdating } = useChannels();
  const [config, setConfig] = useState<TelegramConfig | null>(null);

  // Fetch current config when dialog opens (we need to get the decrypted config)
  useEffect(() => {
    if (open && channel && channel.platform === "telegram") {
      // Since the API doesn't return the config for security reasons,
      // we'll need to handle this differently. For now, we'll show empty fields
      // and let the user re-enter their configuration if they want to update it.
      setConfig({ chat_identifier: "", bot_token: "" });
    } else {
      setConfig(null);
    }
  }, [open, channel]);

  const handleUpdateChannel = async (data: {
    name: string;
    capability: Channel["capability"];
    config: TelegramConfig | Partial<TelegramConfig>;
  }) => {
    if (!channel) return;

    try {
      await updateChannel(channel.id, {
        name: data.name,
        capability: data.capability,
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

    switch (channel.platform) {
      case "telegram":
        return (
          <TelegramChannelForm
            initialData={{
              name: channel.name,
              capability: channel.capability,
              config: config || undefined,
            }}
            onSubmit={handleUpdateChannel}
            isSubmitting={isUpdating}
            isEditing={true}
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

  const platform = platformInfo[channel.platform];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-base">{platform.icon}</span>
            Edit {platform.name} Channel
          </DialogTitle>
          <DialogDescription>
            Update your {platform.name} channel configuration and settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">{renderPlatformForm()}</div>
      </DialogContent>
    </Dialog>
  );
}
