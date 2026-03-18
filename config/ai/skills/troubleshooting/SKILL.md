---
name: troubleshooting
description: Diagnose and help resolve common issues with content processing, channel connectivity, browser control, and audio features.
alwaysInclude: false
tags: [support, debugging, help]
---

# Troubleshooting Guide

## Content Processing Pipeline

When content is added to Eclaire, it goes through a processing pipeline:

1. **Queued** (pending) — Item is saved and waiting for a worker to pick it up
2. **Processing** — A worker is actively working on it (extracting text, generating thumbnails, etc.)
3. **Completed** — Processing finished successfully
4. **Failed** — Processing encountered an error
5. **Retry Pending** — A failed job is queued for automatic retry

You can check the processing status of any item or get an overall summary of the processing pipeline.

### Common Processing Problems

**Content not appearing or stuck**:
- Check the processing status for the specific item to see what stage it's at
- A large backlog of pending items may indicate workers are busy — get the overall summary to see counts
- The user can trigger reprocessing from the item's detail page in the web UI

**Content failed to process**:
- Check the specific item's processing status to see the error message
- Common failures include: network errors when fetching bookmark URLs, unsupported document formats, or corrupted image files
- Suggest trying to reprocess the item from the detail page

**Bookmark not loading content**:
- The target website may be unreachable, behind authentication, or blocking automated access
- Check the processing status for specific error details
- Basic metadata (title, description) may still be available even if full content extraction failed

**Document text not searchable**:
- The document may be a scanned/image-based PDF without text extraction
- Processing may still be in progress — check the status
- Some file formats have limited support

## Channel Connectivity Issues

If a user reports problems with a messaging channel:

**General channel issues**:
- Verify the channel is enabled in **Settings > Channels**
- Check that the channel configuration is complete with all required credentials
- For two-way channels, ensure an assistant is assigned to handle responses

**Telegram**: Bot token must be valid (from @BotFather), bot must be added to the chat/group, webhook URL must be reachable.

**Slack**: App must be installed in the workspace, bot token needs required scopes, bot must be a member of the target channel.

**Discord**: Bot token must be valid, bot needs to be invited to the server with correct permissions, channel ID must be correct.

**Email**: SMTP server credentials must be configured, check for sending limits or spam filtering.

Direct the user to **Settings > Channels** to review and update their channel configuration.

## Browser Automation Issues

If web browsing via Chrome isn't working:

- The Chrome automation server must be configured by an administrator (in the MCP Servers settings)
- Chrome must be running and accessible on the server
- Basic web fetching is available as a fallback for simple page content retrieval

## Audio Issues

If speech-to-text or text-to-speech isn't working:

- Audio models must be configured in the instance settings by an administrator
- The audio service must be running and accessible
- Check whether the specific audio model is available on the system

Direct the user to check with their administrator about audio configuration.

## General Troubleshooting Approach

1. **Identify the symptom**: Ask the user specifically what isn't working
2. **Check status**: Look up processing status for content issues, or ask about configuration for other problems
3. **Look for patterns**: Is it one item or many? Did something recently change? Is it specific to one content type?
4. **Suggest actionable steps**: Point to specific settings pages, suggest reprocessing, or explain what might need to be configured
5. **Escalate gracefully**: If you can't diagnose the issue, suggest the user check server logs or contact their administrator
