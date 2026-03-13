import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import type { Channel, SlackConfig } from "@/hooks/use-channels";

// Create dynamic validation schema based on editing mode
const createSlackFormSchema = (isEditing: boolean) =>
  z.object({
    name: z
      .string()
      .min(1, "Channel name is required")
      .max(255, "Channel name too long"),
    capability: z.enum(["notification", "chat", "bidirectional"], {
      message: "Please select a capability",
    }),
    bot_token: isEditing
      ? z.string() // Allow empty when editing
      : z.string().min(1, "Bot token is required"),
    app_token: isEditing
      ? z.string() // Allow empty when editing
      : z.string().min(1, "App token is required"),
    channel_id: isEditing
      ? z.string() // Allow empty when editing
      : z.string().min(1, "Channel ID is required"),
    mention_mode: z.enum(["all", "mention_only", "mention_or_reply"]),
  });

type SlackFormData = z.infer<ReturnType<typeof createSlackFormSchema>>;

interface SlackChannelFormProps {
  initialData?: {
    name: string;
    capability: Channel["capability"];
    config?: SlackConfig;
  };
  onSubmit: (data: {
    name: string;
    capability: Channel["capability"];
    config: SlackConfig | Partial<SlackConfig>;
  }) => Promise<void>;
  isSubmitting: boolean;
  isEditing?: boolean;
  renderExtraFields?: ReactNode;
}

export default function SlackChannelForm({
  initialData,
  onSubmit,
  isSubmitting,
  isEditing = false,
  renderExtraFields,
}: SlackChannelFormProps) {
  const [showBotToken, setShowBotToken] = useState(false);
  const [showAppToken, setShowAppToken] = useState(false);

  const form = useForm<SlackFormData>({
    resolver: zodResolver(createSlackFormSchema(isEditing)),
    defaultValues: {
      name: initialData?.name || "",
      capability: initialData?.capability || "notification",
      bot_token: initialData?.config?.bot_token || "",
      app_token: initialData?.config?.app_token || "",
      channel_id: initialData?.config?.channel_id || "",
      mention_mode: initialData?.config?.mention_mode || "all",
    },
  });

  const handleSubmit = async (data: SlackFormData) => {
    try {
      let config: SlackConfig | Partial<SlackConfig>;

      if (isEditing) {
        const partialConfig: Partial<SlackConfig> = {};

        if (data.bot_token.trim()) {
          partialConfig.bot_token = data.bot_token.trim();
        }
        if (data.app_token.trim()) {
          partialConfig.app_token = data.app_token.trim();
        }
        if (data.channel_id.trim()) {
          partialConfig.channel_id = data.channel_id.trim();
        }
        partialConfig.mention_mode = data.mention_mode;

        config = partialConfig;
      } else {
        config = {
          bot_token: data.bot_token,
          app_token: data.app_token,
          channel_id: data.channel_id,
          mention_mode: data.mention_mode,
        };
      }

      await onSubmit({
        name: data.name,
        capability: data.capability,
        config,
      });

      if (!isEditing) {
        form.reset({
          name: "",
          capability: "notification",
          bot_token: "",
          app_token: "",
          channel_id: "",
          mention_mode: "all",
        });
      }
    } catch (error) {
      console.error("Form submission error:", error);
    }
  };

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Channel Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., My Slack Notifications"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  A friendly name to identify this channel
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="capability"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Capability</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select channel capability">
                        {field.value === "notification" && "Notify"}
                        {field.value === "chat" && "Chat"}
                        {field.value === "bidirectional" && "Both"}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="notification">
                      <div className="flex flex-col gap-1">
                        <div className="font-medium">Notify</div>
                        <div className="text-xs text-muted-foreground">
                          System can push information to this channel
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="chat">
                      <div className="flex flex-col gap-1">
                        <div className="font-medium">Chat</div>
                        <div className="text-xs text-muted-foreground">
                          Users can chat with the assigned agent on this channel
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="bidirectional">
                      <div className="flex flex-col gap-1">
                        <div className="font-medium">Both</div>
                        <div className="text-xs text-muted-foreground">
                          Notifications plus agent conversation
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Choose how you want to use this Slack channel
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="bot_token"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bot Token</FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      type={showBotToken ? "text" : "password"}
                      placeholder={
                        isEditing
                          ? "Leave empty to keep current token"
                          : "xoxb-..."
                      }
                      {...field}
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowBotToken(!showBotToken)}
                  >
                    {showBotToken ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                <FormDescription>
                  {isEditing
                    ? "Enter new bot token or leave empty to keep current token"
                    : "Bot User OAuth Token from your Slack App settings (kept secure and encrypted)"}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="app_token"
            render={({ field }) => (
              <FormItem>
                <FormLabel>App Token</FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      type={showAppToken ? "text" : "password"}
                      placeholder={
                        isEditing
                          ? "Leave empty to keep current token"
                          : "xapp-..."
                      }
                      {...field}
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowAppToken(!showAppToken)}
                  >
                    {showAppToken ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                <FormDescription>
                  {isEditing
                    ? "Enter new app token or leave empty to keep current token"
                    : "App-Level Token for Socket Mode from your Slack App settings (kept secure and encrypted)"}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="channel_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Channel ID</FormLabel>
                <FormControl>
                  <Input
                    placeholder={
                      isEditing
                        ? "Leave empty to keep current value"
                        : "C1234567890"
                    }
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {isEditing
                    ? "Enter new channel ID or leave empty to keep current value"
                    : "The Slack channel ID (right-click channel > View channel details > copy ID at bottom)"}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="mention_mode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mention Mode</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select mention mode" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex flex-col gap-1">
                        <div className="font-medium">All Messages</div>
                        <div className="text-xs text-muted-foreground">
                          Process every message in the channel
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="mention_only">
                      <div className="flex flex-col gap-1">
                        <div className="font-medium">Mentions Only</div>
                        <div className="text-xs text-muted-foreground">
                          Only respond when @mentioned
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="mention_or_reply">
                      <div className="flex flex-col gap-1">
                        <div className="font-medium">Mentions or Replies</div>
                        <div className="text-xs text-muted-foreground">
                          Respond when @mentioned or in a thread
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Choose when the bot should respond to messages
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {renderExtraFields}

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : initialData
                  ? "Update Channel"
                  : "Create Channel"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
