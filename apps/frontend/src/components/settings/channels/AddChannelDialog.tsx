import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Channel,
  type TelegramConfig,
  useChannels,
} from "@/hooks/use-channels";
import TelegramChannelForm from "./TelegramChannelForm";

const platformInfo = {
  telegram: {
    name: "Telegram",
    description: "Receive notifications and chat via Telegram Bot",
    icon: "📱",
    available: true,
  },
  slack: {
    name: "Slack",
    description: "Send notifications to Slack channels",
    icon: "💬",
    available: false, // Not implemented yet
  },
  whatsapp: {
    name: "WhatsApp",
    description: "Send notifications via WhatsApp Business API",
    icon: "💚",
    available: false, // Not implemented yet
  },
  email: {
    name: "Email",
    description: "Send email notifications",
    icon: "📧",
    available: false, // Not implemented yet
  },
} as const;

interface AddChannelDialogProps {
  trigger?: React.ReactNode;
}

export default function AddChannelDialog({ trigger }: AddChannelDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<
    Channel["platform"] | null
  >(null);
  const { createChannel, isCreating } = useChannels();

  const handleCreateChannel = async (data: {
    name: string;
    capability: Channel["capability"];
    config: TelegramConfig | Partial<TelegramConfig>;
  }) => {
    if (!selectedPlatform) return;

    try {
      await createChannel({
        name: data.name,
        platform: selectedPlatform,
        capability: data.capability,
        config: data.config,
      });

      // Reset and close dialog on success
      handleOpenChange(false);
    } catch (_error) {
      // Error handling is done in the hook
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset platform selection when closing
      setSelectedPlatform(null);
    }
    setOpen(newOpen);
  };

  const renderPlatformForm = () => {
    switch (selectedPlatform) {
      case "telegram":
        return (
          <TelegramChannelForm
            onSubmit={handleCreateChannel}
            isSubmitting={isCreating}
          />
        );
      default:
        return (
          <div className="text-center py-8 text-muted-foreground">
            Platform integration coming soon...
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Channel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Communication Channel</DialogTitle>
          <DialogDescription>
            Connect a new platform to receive notifications and interact with
            your assistant.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {!selectedPlatform ? (
            // Platform selection step
            <div className="space-y-4">
              <div>
                <Label className="text-base font-medium">Choose Platform</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Select which platform you'd like to connect.
                </p>
              </div>

              <Select
                value={selectedPlatform || ""}
                onValueChange={(value) =>
                  setSelectedPlatform(value as Channel["platform"])
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a platform" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(platformInfo).map(([platform, info]) => (
                    <SelectItem
                      key={platform}
                      value={platform}
                      disabled={!info.available}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-base">{info.icon}</span>
                        <div className="flex-1">
                          <div className="font-medium flex items-center gap-2">
                            {info.name}
                            {!info.available && (
                              <span className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">
                                Coming Soon
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {info.description}
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedPlatform && (
                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedPlatform(null)}
                  >
                    Back
                  </Button>
                  <Button
                    onClick={() => {
                      /* Platform is selected, form will show */
                    }}
                  >
                    Continue
                  </Button>
                </div>
              )}
            </div>
          ) : (
            // Configuration form step
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">
                    Configure {platformInfo[selectedPlatform].name}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {platformInfo[selectedPlatform].description}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedPlatform(null)}
                >
                  Change Platform
                </Button>
              </div>

              {renderPlatformForm()}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
