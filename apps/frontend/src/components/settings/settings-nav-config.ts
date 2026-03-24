import {
  Bot,
  Cpu,
  Info,
  Key,
  type LucideIcon,
  Palette,
  Plug,
  Radio,
  Server,
  Shield,
  Sliders,
  User,
  Users,
  Volume2,
  Wrench,
  Sparkles,
} from "lucide-react";

export interface SettingsNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export interface SettingsNavSeparator {
  separator: true;
  key: string;
  label?: string;
}

export type SettingsNavEntry = SettingsNavItem | SettingsNavSeparator;

export function isSeparator(
  entry: SettingsNavEntry,
): entry is SettingsNavSeparator {
  return "separator" in entry && entry.separator === true;
}

export const SETTINGS_NAV: SettingsNavEntry[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "account", label: "Account", icon: Shield },
  { id: "appearance", label: "Appearance", icon: Palette },
  { separator: true, key: "sep-ai", label: "AI & Voice" },
  { id: "assistant", label: "Assistant", icon: Bot },
  { id: "voice", label: "Voice", icon: Volume2 },
  { separator: true, key: "sep-tools", label: "Tools & Integrations" },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "skills", label: "Skills", icon: Sparkles },
  {
    id: "mcp-servers",
    label: "MCP Servers",
    icon: Plug,
    adminOnly: true,
  },
  {
    id: "browser",
    label: "Browser",
    icon: Sliders,
    adminOnly: true,
  },
  { id: "channels", label: "Channels", icon: Radio },
  { id: "api-keys", label: "API Keys", icon: Key },
  { separator: true, key: "sep-admin", label: "Administration" },
  { id: "models", label: "Models", icon: Cpu, adminOnly: true },
  { id: "providers", label: "Providers", icon: Server, adminOnly: true },
  {
    id: "users",
    label: "Users",
    icon: Users,
    adminOnly: true,
  },
  { separator: true, key: "sep-about" },
  { id: "about", label: "About", icon: Info },
];

/** All valid section IDs for route validation */
export const VALID_SECTIONS = SETTINGS_NAV.filter(
  (e): e is SettingsNavItem => !isSeparator(e),
).map((e) => e.id);

/** Map old tab names to new section IDs for backward compat */
export const TAB_TO_SECTION: Record<string, string> = {
  profile: "profile",
  account: "account",
  appearance: "appearance",
  assistant: "assistant",
  channels: "channels",
  system: "models",
  "api-keys": "api-keys",
  about: "about",
  "audio-defaults": "voice",
  "voice-defaults": "voice",
  "model-defaults": "models",
  registration: "users",
};
