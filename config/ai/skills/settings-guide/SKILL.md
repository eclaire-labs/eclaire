---
name: settings-guide
description: Help users understand and navigate their profile, account, appearance, channel, and assistant settings.
alwaysInclude: false
tags: [settings, configuration, help]
---

# Settings Guide

## What You Can Change Directly

You can check and update the user's profile settings on their behalf:

- **Display Name** — The name shown in the UI and to other users
- **Full Name** — Their full formal name
- **Bio** — A short description or note about themselves
- **Timezone** — e.g., "America/New_York", "Europe/Paris", "Asia/Tokyo"
- **City** — Their city
- **Country** — Their country

Always check their current values first and confirm before making any changes.

## What Requires the Settings UI

For the following, guide the user to the appropriate page in the Eclaire interface:

### Account (Settings > Account)
- **Password change** — Must be done through the UI for security (requires current password)
- **Delete account** — Requires password confirmation
- **Delete all data** — Removes all content while keeping the account

### Appearance (Settings > Appearance)
- **Theme** — Light or dark mode

### API Keys (Settings > API Keys)
- **Create, view, or revoke API keys** — Used for programmatic access and external integrations

### Channels (Settings > Channels)
- **Add or configure messaging integrations** — Telegram, Slack, Discord, Email, WhatsApp
- Each platform has its own setup requirements:
  - **Telegram**: Create a bot via @BotFather and enter the bot token
  - **Slack**: Install the app in a workspace and configure bot permissions
  - **Discord**: Set up a bot with the correct server permissions and channel ID
  - **Email**: Configure SMTP server credentials
  - **WhatsApp**: Set up API credentials

### Assistants (Settings > Assistants)
- **Create custom assistants** — Define new AI assistants with custom instructions, specific tools, and dedicated models
- **Edit assistants** — Adjust an assistant's personality, capabilities, or model
- Assistants can be specialized for different use cases (e.g., a research assistant, a writing assistant)

## How to Handle Settings Requests

- **"What's my timezone?"** → Look up their current settings and tell them
- **"Change my name to X"** → Show their current name, confirm the change, then update it
- **"How do I set up Telegram?"** → Explain the process and direct them to Settings > Channels
- **"How do I create an API key?"** → Direct them to Settings > API Keys
- **"Can you change my password?"** → Explain that password changes must be done through Settings > Account for security
- **"How do I create a custom assistant?"** → Explain what assistants are and direct them to Settings > Assistants
