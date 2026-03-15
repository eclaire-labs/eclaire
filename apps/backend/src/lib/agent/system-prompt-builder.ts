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

const SCHEDULING_TOOL_NAMES = ["createTask", "updateTask"];

function hasSchedulingTools(
  tools: Record<string, RuntimeToolDefinition>,
): boolean {
  return SCHEDULING_TOOL_NAMES.some((name) => name in tools);
}

const SCHEDULING_INSTRUCTIONS = `

**Scheduling & Recurring Work**

When users ask for reminders, recurring summaries, periodic checks, or any scheduled work:
1. Create a recurring task using createTask with isRecurring=true, a cronExpression, and assignToSelf=true
2. Always confirm the schedule with the user before creating it
3. You can use getDueItems to check what needs attention and findTasks to review scheduled tasks

Common cron patterns (5-field: minute hour day-of-month month day-of-week):
- Daily at 9am: 0 9 * * *
- Every Monday at 9am: 0 9 * * 1
- Weekdays at 9am: 0 9 * * 1-5
- First of each month: 0 9 1 * *
- Every hour: 0 * * * *

To stop a recurring task, update it with isRecurring=false.`;

function hasContentTools(
  tools: Record<string, RuntimeToolDefinition>,
): boolean {
  return CONTENT_TOOL_NAMES.some((name) => name in tools);
}

const CONTENT_LINKING_INSTRUCTIONS = `

**CRITICAL: Content Linking Requirements**

WHENEVER you reference ANY content item found through tool calls, you MUST include the internal app link in this EXACT format:

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

REMEMBER: These /content-type/id links become clickable buttons in the user interface for easy navigation.`;

export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
  const {
    userContext,
    agent,
    assetContents,
    tools = {},
    toolCallingMode = "native",
    isBackgroundTaskExecution = false,
  } = options;

  const includeToolSignatures = toolCallingMode === "text";

  const currentDate = new Date();
  const currentTimeString = currentDate.toISOString();
  const currentDateString = currentDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const fallbackInstruction = userContext?.displayName
    ? `You are a helpful assistant talking to ${userContext.displayName}.`
    : "You are a helpful assistant.";
  const baseInstruction = agent?.systemPrompt?.trim() || fallbackInstruction;

  let userContextInfo = "";
  if (userContext) {
    const hasContext =
      userContext.displayName ||
      userContext.fullName ||
      userContext.bio ||
      userContext.city ||
      userContext.country;

    if (hasContext) {
      userContextInfo = "\n\nUser Profile Information:";
      if (userContext.displayName) {
        userContextInfo += `\n- Display Name: ${userContext.displayName}`;
      }
      if (userContext.fullName) {
        userContextInfo += `\n- Full Name: ${userContext.fullName}`;
      }
      if (userContext.bio) {
        userContextInfo += `\n- About: ${userContext.bio}`;
      }
      if (userContext.city) {
        userContextInfo += `\n- City: ${userContext.city}`;
      }
      if (userContext.country) {
        userContextInfo += `\n- Country: ${userContext.country}`;
      }
      if (userContext.timezone) {
        userContextInfo += `\n- Timezone: ${userContext.timezone}`;
      }
    }
  }

  let assetContentSection = "";
  if (assetContents && assetContents.length > 0) {
    assetContentSection =
      "\n\n## Referenced Content\n\nThe user has provided the following specific content for you to reference:\n\n";

    for (const asset of assetContents) {
      assetContentSection += `### ${asset.type.charAt(0).toUpperCase() + asset.type.slice(1)} (ID: ${asset.id})\n`;
      if (asset.content) {
        const truncatedContent =
          asset.content.length > 4000
            ? `${asset.content.substring(0, 4000)}\n\n[Content truncated - showing first 4000 characters]`
            : asset.content;
        assetContentSection += `${truncatedContent}\n\n`;
      } else {
        assetContentSection += "[No content available]\n\n";
      }
    }

    assetContentSection +=
      "When answering the user's question, please reference and use the content above as the primary source. Focus on providing a helpful response based on this content.\n";
  }

  const basePrompt = `${baseInstruction}

Current Date & Time: ${currentDateString} (${currentTimeString})${userContextInfo}${assetContentSection}`;

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

  const schedulingNormal = hasSchedulingTools(tools)
    ? SCHEDULING_INSTRUCTIONS
    : "";

  return appendAgentCapabilities(
    `${basePrompt}${contentLinkingNormal}${schedulingNormal}
${toolSignaturesSection}`,
    { skillNames: agent?.skillNames, tools },
  );
}
