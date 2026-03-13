import { DEFAULT_AGENT_ACTOR_ID } from "@eclaire/api-types";
import { PLATFORM_METADATA } from "@eclaire/api-types/channels";
import { Plus } from "lucide-react";
import { useState } from "react";
import { ActorPicker } from "@/components/shared/ActorPicker";
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
import { useActors } from "@/hooks/use-actors";
import {
  type Channel,
  type SlackConfig,
  type TelegramConfig,
  useChannels,
} from "@/hooks/use-channels";
import SlackChannelForm from "./SlackChannelForm";
import TelegramChannelForm from "./TelegramChannelForm";

interface AddChannelDialogProps {
  trigger?: React.ReactNode;
}

export default function AddChannelDialog({ trigger }: AddChannelDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<
    Channel["platform"] | null
  >(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(
    DEFAULT_AGENT_ACTOR_ID,
  );
  const { createChannel, isCreating } = useChannels();
  const { actors: availableAgents } = useActors(["agent"]);

  const handleCreateChannel = async (data: {
    name: string;
    capability: Channel["capability"];
    config:
      | TelegramConfig
      | Partial<TelegramConfig>
      | SlackConfig
      | Partial<SlackConfig>;
  }) => {
    if (!selectedPlatform) return;

    try {
      await createChannel({
        name: data.name,
        platform: selectedPlatform,
        capability: data.capability,
        agentActorId:
          data.capability === "notification" ? null : selectedAgentId,
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
      setSelectedAgentId(DEFAULT_AGENT_ACTOR_ID);
    }
    setOpen(newOpen);
  };

  const renderAgentSelect = (
    <div className="space-y-2">
      <Label htmlFor="new-channel-agent">Channel Agent</Label>
      <ActorPicker
        id="new-channel-agent"
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
      <p className="text-sm text-muted-foreground">
        Chat-capable channels will route conversations through this agent.
      </p>
    </div>
  );

  const renderPlatformForm = () => {
    switch (selectedPlatform) {
      case "telegram":
        return (
          <TelegramChannelForm
            onSubmit={handleCreateChannel}
            isSubmitting={isCreating}
            renderExtraFields={renderAgentSelect}
          />
        );
      case "slack":
        return (
          <SlackChannelForm
            onSubmit={handleCreateChannel}
            isSubmitting={isCreating}
            renderExtraFields={renderAgentSelect}
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
            your selected agent.
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
                  {Object.entries(PLATFORM_METADATA).map(([platform, info]) => (
                    <SelectItem
                      key={platform}
                      value={platform}
                      disabled={!info.available}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-base">{info.icon}</span>
                        <div className="flex-1">
                          <div className="font-medium flex items-center gap-2">
                            {info.displayName}
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
                    Configure {PLATFORM_METADATA[selectedPlatform].displayName}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {PLATFORM_METADATA[selectedPlatform].description}
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
