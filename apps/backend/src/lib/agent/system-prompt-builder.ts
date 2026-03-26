/**
 * System Prompt Builder
 *
 * Builds personalized system prompts for the selected agent.
 */

import {
  appendAgentCapabilities,
  getToolSignatures,
  type RuntimeToolDefinition,
  type ToolCallingMode,
} from "@eclaire/ai";
import type { AgentDefinition, UserContext } from "./types.js";

export type { ToolCallingMode } from "@eclaire/ai";

export interface AssetContent {
  type: string;
  id: string;
  content: string;
}

export interface BuildSystemPromptOptions {
  userContext?: UserContext | null;
  agent?: AgentDefinition;
  assetContents?: AssetContent[];
  tools?: Record<string, RuntimeToolDefinition>;
  toolCallingMode?: ToolCallingMode;
  isBackgroundTaskExecution?: boolean;
  /** When true, the agent is operating in read-only mode (no write tools). */
  isReadOnly?: boolean;
}

const CONTENT_TOOL_NAMES = [
  "findNotes",
  "findBookmarks",
  "findDocuments",
  "findPhotos",
  "findTasks",
  "searchAll",
  "getNote",
  "getBookmark",
  "getTask",
  "getDueItems",
];

const SCHEDULED_ACTION_TOOL_NAMES = ["scheduleAction"];

function hasScheduledActionTools(
  tools: Record<string, RuntimeToolDefinition>,
): boolean {
  return SCHEDULED_ACTION_TOOL_NAMES.some((name) => name in tools);
}

const REMINDER_INSTRUCTIONS = `

**Reminders & Scheduled Actions**

Use scheduleAction for all time-based work:

- One-off reminders ("remind me to X in 5 minutes", "at 3pm remind me to Y"):
  kind='reminder', triggerAt=<absolute ISO 8601 datetime>

- Recurring agent work ("every morning summarize my tasks", "weekly report every Monday"):
  kind='agent_run', cronExpression=<cron>, message=<instructions for the AI agent>

- One-off agent work ("tomorrow at 8pm, send a summary of today's notes"):
  kind='agent_run', triggerAt=<absolute ISO 8601 datetime>

Convert relative times to absolute ISO 8601 datetime using the current date/time and user timezone.
Common cron: daily at 9am = '0 9 * * *', weekdays = '0 9 * * 1-5', Monday = '0 9 * * 1'.

Do NOT use createTask for reminders or scheduled work. Tasks are work items with due dates.`;

function hasContentTools(
  tools: Record<string, RuntimeToolDefinition>,
): boolean {
  return CONTENT_TOOL_NAMES.some((name) => name in tools);
}

const COMMUNICATION_STYLE_INSTRUCTIONS = `

**Communication Style**

Never mention tool names, function calls, or internal mechanics in your responses.
The user does not need to know how you work internally.
- Say "Let me check your settings" — not "I'll use the getUserSettings tool"
- Say "Let me look into that" — not "I'll use getProcessingStatus to check"
When directing users to the UI, use natural navigation language like "You can find this in Settings > Channels".

**CRITICAL: Never claim to have performed an action unless you actually called the appropriate tool and received a successful result.**
You MUST use a tool to perform any create, update, or delete action. Reading data also requires a tool call.
Do not say "I've updated X" or "Done" unless the tool was actually called and succeeded in the current turn.`;

const CONTENT_LINKING_INSTRUCTIONS = `

**CRITICAL: Content Linking Requirements**

WHENEVER you reference a content item found through tool calls, you MUST include the internal app link in this EXACT format:

FORMAT: /{content-type}/{exact-id-from-tool}

REQUIRED FORMATS:
- Bookmarks: /bookmarks/bm-oCwyieTY1w
- Documents: /documents/doc-abc123
- Photos: /photos/photo-xyz789
- Tasks: /tasks/task-456
- Notes: /notes/note-789

CRITICAL RULES:
1. ALWAYS use the exact 'id' field returned by tool functions
2. NEVER use markdown links like [text](url)
3. NEVER use external URLs when referencing internal content
4. Include the app link DIRECTLY in your response text
5. These are internal app navigation links, NOT web URLs
6. Include each content link only ONCE — do NOT repeat the same link multiple times in a single response

REMEMBER: These /content-type/id links become clickable buttons in the user interface for easy navigation.`;

// =============================================================================
// SHARED HELPERS
// =============================================================================

function buildDateSection(): { dateString: string; timeString: string } {
  const currentDate = new Date();
  return {
    dateString: currentDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    timeString: currentDate.toISOString(),
  };
}

function buildBaseInstruction(
  userContext?: UserContext | null,
  agent?: AgentDefinition,
): string {
  const fallback = userContext?.displayName
    ? `You are a helpful assistant talking to ${userContext.displayName}.`
    : "You are a helpful assistant.";
  return agent?.systemPrompt?.trim() || fallback;
}

function buildUserContextSection(userContext?: UserContext | null): string {
  if (!userContext) return "";

  const hasContext =
    userContext.displayName ||
    userContext.fullName ||
    userContext.bio ||
    userContext.city ||
    userContext.country;

  if (!hasContext) return "";

  let section = "\n\nUser Profile Information:";
  if (userContext.displayName)
    section += `\n- Display Name: ${userContext.displayName}`;
  if (userContext.fullName) section += `\n- Full Name: ${userContext.fullName}`;
  if (userContext.bio) section += `\n- About: ${userContext.bio}`;
  if (userContext.city) section += `\n- City: ${userContext.city}`;
  if (userContext.country) section += `\n- Country: ${userContext.country}`;
  if (userContext.timezone) section += `\n- Timezone: ${userContext.timezone}`;
  if (userContext.isInstanceAdmin)
    section += "\n- Role: Instance Administrator";
  return section;
}

function buildAssetContentSection(assetContents?: AssetContent[]): string {
  if (!assetContents || assetContents.length === 0) return "";

  let section =
    "\n\n## Referenced Content\n\nThe user has provided the following specific content for you to reference:\n\n";

  for (const asset of assetContents) {
    section += `### ${asset.type.charAt(0).toUpperCase() + asset.type.slice(1)} (ID: ${asset.id})\n`;
    if (asset.content) {
      const truncatedContent =
        asset.content.length > 4000
          ? `${asset.content.substring(0, 4000)}\n\n[Content truncated - showing first 4000 characters]`
          : asset.content;
      section += `${truncatedContent}\n\n`;
    } else {
      section += "[No content available]\n\n";
    }
  }

  section +=
    "When answering the user's question, please reference and use the content above as the primary source. Focus on providing a helpful response based on this content.\n";
  return section;
}

// =============================================================================
// EXTERNAL HARNESS PROMPT
// =============================================================================

export interface BuildExternalHarnessPromptOptions {
  userContext?: UserContext | null;
  agent?: AgentDefinition;
  assetContents?: AssetContent[];
  isBackgroundTaskExecution?: boolean;
}

/**
 * Build a minimal prompt for external harness agents.
 * Includes only task context — no tool signatures, skills, MCP, or Eclaire-specific instructions.
 */
export function buildExternalHarnessPrompt(
  options: BuildExternalHarnessPromptOptions,
): string {
  const { userContext, agent, assetContents, isBackgroundTaskExecution } =
    options;

  const { dateString, timeString } = buildDateSection();
  const baseInstruction = buildBaseInstruction(userContext, agent);
  const userContextInfo = buildUserContextSection(userContext);
  const assetContentSection = buildAssetContentSection(assetContents);

  let prompt = `${baseInstruction}\n\nCurrent Date & Time: ${dateString} (${timeString})${userContextInfo}${assetContentSection}`;

  if (isBackgroundTaskExecution) {
    prompt +=
      "\n\nYou are working on a background task. Complete the task described above.";
  }

  return prompt;
}

// =============================================================================
// NATIVE PROMPT
// =============================================================================

export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
  const {
    userContext,
    agent,
    assetContents,
    tools = {},
    toolCallingMode = "native",
    isBackgroundTaskExecution = false,
    isReadOnly = false,
  } = options;

  const includeToolSignatures = toolCallingMode === "text";

  const { dateString, timeString } = buildDateSection();
  const baseInstruction = buildBaseInstruction(userContext, agent);
  const userContextInfo = buildUserContextSection(userContext);
  const assetContentSection = buildAssetContentSection(assetContents);

  const readOnlyNotice = isReadOnly
    ? "\n\n**Read-Only Mode**: You are operating in read-only mode. You can search, retrieve, and analyze content, but you cannot create, update, or delete anything. If the user asks you to make changes, explain that this session is read-only."
    : "";

  const basePrompt = `${baseInstruction}

Current Date & Time: ${dateString} (${timeString})${userContextInfo}${readOnlyNotice}${assetContentSection}`;

  if (isBackgroundTaskExecution) {
    const toolSignaturesSection = includeToolSignatures
      ? `
Analyze the task request. If it requires searching for information or counting items, invoke the appropriate tool from the ones listed below.
Dates must be ISO strings (YYYY-MM-DD).

\`\`\`typescript
${getToolSignatures(tools)}
\`\`\`

# Response Format: Plain Text with Optional Tool Calls

Respond with plain text. You may use markdown formatting for better readability.

## Tool Calls (when needed)
If you need to call tools, use this JSON format:
\`\`\`json
{"type": "tool_calls", "calls": [{"name": "function_name", "args": {...}}, {"name": "another_function", "args": {...}}]}
\`\`\`

## Rules
1. Use plain text for all responses
2. Only use JSON format for tool calls
3. Group related tool calls in the same JSON object
`
      : "";

    const contentLinking = hasContentTools(tools)
      ? `\n4. Reference any relevant content you find using the internal app links format${CONTENT_LINKING_INSTRUCTIONS}`
      : "";

    return appendAgentCapabilities(
      `${basePrompt}

You are an AI assistant that has been assigned to work on a task. You have full access to search tools to find related information in the user's knowledge base (notes, bookmarks, documents, photos, and other tasks) that might be relevant to completing this task.

When working on tasks:
1. Analyze the task details provided above
2. Search for related content that might help with the task using available tools
3. Provide a helpful, practical, and actionable response${contentLinking}
${toolSignaturesSection}`,
      { skillNames: agent?.skillNames, tools },
    );
  }

  if (toolCallingMode === "off") {
    return appendAgentCapabilities(
      `${basePrompt}

Please provide a helpful and informative response based on the user's question and any referenced content above. Be conversational and focus on directly answering their question.`,
      { skillNames: agent?.skillNames, tools },
    );
  }

  const toolSignaturesSection = includeToolSignatures
    ? `
# Response Format: Plain Text with Optional Tool Calls

Respond with plain text. You may use markdown formatting for better readability.

## Tool Calls (when needed)
If you need to call tools, use this JSON format:
\`\`\`json
{"type": "tool_calls", "calls": [{"name": "function_name", "args": {...}}, {"name": "another_function", "args": {...}}]}
\`\`\`

## Rules
1. Use plain text for all responses
2. Only use JSON format for tool calls
3. Group related tool calls in the same JSON object

Dates must be ISO strings (YYYY-MM-DD).

\`\`\`typescript
${getToolSignatures(tools)}
\`\`\`
`
    : "";

  const contentLinkingNormal = hasContentTools(tools)
    ? CONTENT_LINKING_INSTRUCTIONS
    : "";

  const scheduledActionNormal = hasScheduledActionTools(tools)
    ? REMINDER_INSTRUCTIONS
    : "";

  return appendAgentCapabilities(
    `${basePrompt}${COMMUNICATION_STYLE_INSTRUCTIONS}${contentLinkingNormal}${scheduledActionNormal}
${toolSignaturesSection}`,
    { skillNames: agent?.skillNames, tools },
  );
}
