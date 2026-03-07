import type {
  ChannelCapability,
  ChannelPlatform,
} from "@eclaire/core/types";

export interface PlatformMetadata {
  platform: ChannelPlatform;
  displayName: string;
  description: string;
  icon: string;
  capabilities: readonly ChannelCapability[];
  available: boolean;
}

export const PLATFORM_METADATA: Record<ChannelPlatform, PlatformMetadata> = {
  telegram: {
    platform: "telegram",
    displayName: "Telegram",
    description: "Receive notifications and chat via Telegram Bot",
    icon: "📱",
    capabilities: ["notification", "chat", "bidirectional"],
    available: true,
  },
  slack: {
    platform: "slack",
    displayName: "Slack",
    description: "Send notifications to Slack channels",
    icon: "💬",
    capabilities: ["notification"],
    available: false,
  },
  whatsapp: {
    platform: "whatsapp",
    displayName: "WhatsApp",
    description: "Send notifications via WhatsApp Business API",
    icon: "💚",
    capabilities: ["notification"],
    available: false,
  },
  email: {
    platform: "email",
    displayName: "Email",
    description: "Send email notifications",
    icon: "📧",
    capabilities: ["notification"],
    available: false,
  },
  discord: {
    platform: "discord",
    displayName: "Discord",
    description: "Receive notifications and chat via Discord Bot",
    icon: "🎮",
    capabilities: ["notification", "chat", "bidirectional"],
    available: true,
  },
};
