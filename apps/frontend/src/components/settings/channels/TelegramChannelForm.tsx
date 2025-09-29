import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
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
import type { Channel, TelegramConfig } from "@/hooks/use-channels";

// Create dynamic validation schema based on editing mode
const createTelegramFormSchema = (isEditing: boolean) =>
  z.object({
    name: z
      .string()
      .min(1, "Channel name is required")
      .max(255, "Channel name too long"),
    capability: z.enum(["notification", "chat", "bidirectional"], {
      message: "Please select a capability",
    }),
    chat_identifier: isEditing
      ? z.string() // Allow empty when editing
      : z.string().min(1, "Chat identifier is required"),
    bot_token: isEditing
      ? z.string() // Allow empty when editing
      : z.string().min(1, "Bot token is required"),
  });

type TelegramFormData = z.infer<ReturnType<typeof createTelegramFormSchema>>;

interface TelegramChannelFormProps {
  initialData?: {
    name: string;
    capability: Channel["capability"];
    config?: TelegramConfig;
  };
  onSubmit: (data: {
    name: string;
    capability: Channel["capability"];
    config: TelegramConfig | Partial<TelegramConfig>;
  }) => Promise<void>;
  isSubmitting: boolean;
  isEditing?: boolean;
}

export default function TelegramChannelForm({
  initialData,
  onSubmit,
  isSubmitting,
  isEditing = false,
}: TelegramChannelFormProps) {
  const [showBotToken, setShowBotToken] = useState(false);

  const form = useForm<TelegramFormData>({
    resolver: zodResolver(createTelegramFormSchema(isEditing)),
    defaultValues: {
      name: initialData?.name || "",
      capability: initialData?.capability || "notification",
      chat_identifier: initialData?.config?.chat_identifier || "",
      bot_token: initialData?.config?.bot_token || "",
    },
  });

  const handleSubmit = async (data: TelegramFormData) => {
    try {
      // Build config based on editing mode
      let config: TelegramConfig | Partial<TelegramConfig>;

      if (isEditing) {
        // For editing, only include config fields that have actual values
        const partialConfig: Partial<TelegramConfig> = {};

        if (data.chat_identifier.trim()) {
          partialConfig.chat_identifier = data.chat_identifier.trim();
        }

        if (data.bot_token.trim()) {
          partialConfig.bot_token = data.bot_token.trim();
        }

        config = partialConfig;
      } else {
        // For creating, require all fields (backend will validate)
        config = {
          chat_identifier: data.chat_identifier,
          bot_token: data.bot_token,
        };
      }

      await onSubmit({
        name: data.name,
        capability: data.capability,
        config,
      });

      // Reset form on successful creation (not editing)
      if (!isEditing) {
        form.reset({
          name: "",
          capability: "notification",
          chat_identifier: "",
          bot_token: "",
        });
      }
    } catch (error) {
      // Error is handled by parent component
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
                    placeholder="e.g., My Telegram Notifications"
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
                          Users can chat with the assistant on this channel
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="bidirectional">
                      <div className="flex flex-col gap-1">
                        <div className="font-medium">Both</div>
                        <div className="text-xs text-muted-foreground">
                          Both notifications and chat functionality
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Choose how you want to use this Telegram channel
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="chat_identifier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Chat Identifier</FormLabel>
                <FormControl>
                  <Input
                    placeholder={
                      isEditing
                        ? "Leave empty to keep current value"
                        : "@mychannel or -1001234567890"
                    }
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {isEditing
                    ? "Enter new chat identifier or leave empty to keep current value"
                    : "The channel username (e.g., @mychannel) or chat ID (e.g., -1001234567890)"}
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
                          : "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
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
                    : "The bot token provided by @BotFather (kept secure and encrypted)"}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-between items-center space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open("/docs#telegram-setup", "_blank")}
            >
              View Documentation
            </Button>
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
