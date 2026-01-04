/**
 * System Prompt Builder
 *
 * Builds personalized system prompts for the AI agent.
 * Extracted from the original prompt.ts for better modularity.
 */

import type { UserContext } from "./types.js";
import { backendTools } from "./tools/index.js";
import { toOpenAITools } from "@eclaire/ai";

export interface AssetContent {
  type: string;
  id: string;
  content: string;
}

export type ToolCallingMode = "native" | "text" | "off";

export interface BuildSystemPromptOptions {
  userContext?: UserContext | null;
  assetContents?: AssetContent[];
  toolCallingMode?: ToolCallingMode;
  isBackgroundTaskExecution?: boolean;
}

/**
 * Generate tool signatures for the system prompt.
 * Uses the declarative tool definitions to create TypeScript-like signatures.
 */
function getToolSignatures(): string {
  const tools = toOpenAITools(backendTools);
  return tools
    .map((t) => {
      const params = t.function.parameters as { properties?: Record<string, unknown> };
      const paramStr = params.properties
        ? Object.entries(params.properties)
            .map(([name, schema]) => {
              const s = schema as { type?: string; description?: string };
              return `${name}?: ${s.type || "any"}`;
            })
            .join(", ")
        : "";
      return `function ${t.function.name}(${paramStr}): Promise<any>; // ${t.function.description}`;
    })
    .join("\n");
}

/**
 * Build the system prompt with user context and current date/time
 */
export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
  const {
    userContext,
    assetContents,
    toolCallingMode = "native",
    isBackgroundTaskExecution = false,
  } = options;

  // Only include tool signatures/JSON format for "text" mode
  // In "native" mode, tools are sent via API - no need to describe them in prompt
  const includeToolSignatures = toolCallingMode === "text";

  const currentDate = new Date();
  const currentTimeString = currentDate.toISOString();
  const currentDateString = currentDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Build personalized greeting
  let personalizedGreeting = "You are a helpful assistant.";
  if (userContext?.displayName) {
    personalizedGreeting = `You are a helpful assistant talking to ${userContext.displayName}.`;
  }

  // Add user context information
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

  // Build asset content section
  let assetContentSection = "";
  if (assetContents && assetContents.length > 0) {
    assetContentSection =
      "\n\n## Referenced Content\n\nThe user has provided the following specific content for you to reference:\n\n";

    for (const asset of assetContents) {
      assetContentSection += `### ${asset.type.charAt(0).toUpperCase() + asset.type.slice(1)} (ID: ${asset.id})\n`;
      if (asset.content) {
        // Truncate very long content to avoid overwhelming the AI
        const truncatedContent =
          asset.content.length > 4000
            ? asset.content.substring(0, 4000) +
              "\n\n[Content truncated - showing first 4000 characters]"
            : asset.content;
        assetContentSection += `${truncatedContent}\n\n`;
      } else {
        assetContentSection += "[No content available]\n\n";
      }
    }

    assetContentSection +=
      "When answering the user's question, please reference and use the content above as the primary source. Focus on providing a helpful response based on this content.\n";
  }

  // Base prompt with personalization and content
  const basePrompt = `${personalizedGreeting}

Current Date & Time: ${currentDateString} (${currentTimeString})${userContextInfo}${assetContentSection}`;

  // Special prompt for background task execution
  if (isBackgroundTaskExecution) {
    const toolSignaturesSection = includeToolSignatures
      ? `
Analyze the task request. If it requires searching for information or counting items, invoke the appropriate tool from the ones listed below.
Dates must be ISO strings (YYYY-MM-DD).

\`\`\`typescript
${getToolSignatures()}
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

    return `${basePrompt}

You are an AI assistant that has been assigned to work on a task. You have full access to search tools to find related information in the user's knowledge base (notes, bookmarks, documents, photos, and other tasks) that might be relevant to completing this task.

When working on tasks:
1. Analyze the task details provided above
2. Search for related content that might help with the task using available tools
3. Provide a helpful, practical, and actionable response
4. Reference any relevant content you find using the internal app links format

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

REMEMBER: These /content-type/id links become clickable buttons in the user interface for easy navigation.
${toolSignaturesSection}`;
  }

  // If tools are off, return simple conversational prompt
  if (toolCallingMode === "off") {
    return `${basePrompt}

Please provide a helpful and informative response based on the user's question and any referenced content above. Be conversational and focus on directly answering their question.`;
  }

  // Tool signatures section only for "text" mode
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
${getToolSignatures()}
\`\`\`
`
    : "";

  // Prompt with content linking requirements (always) and tool signatures (text mode only)
  return `${basePrompt}

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

REMEMBER: These /content-type/id links become clickable buttons in the user interface for easy navigation.
${toolSignaturesSection}`;
}
