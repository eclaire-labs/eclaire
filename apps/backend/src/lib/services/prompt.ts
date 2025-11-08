import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const { bookmarks, documents, notes, photos, tasks } = schema;
import {
  type AIMessage,
  callAI,
  callAIStream,
  getAIProviderInfo,
} from "@/lib/ai-client";
import { aiPromptLogger } from "@/lib/ai-prompt-logger";
import { createChildLogger } from "@/lib/logger";
import { LLMStreamParser } from "@/lib/parser-stream-text";
import {
  extractFinalResponse,
  extractToolCalls,
  parseTextToolContent,
  type TextToolParseResult,
} from "@/lib/parser-text";
import {
  type ConversationWithMessages,
  createConversation,
  generateConversationTitle,
  getConversationWithMessages,
  updateConversationActivity,
} from "@/lib/services/conversations";
import { buildAIMessageArray, createMessage } from "@/lib/services/messages";
import { objectStorage } from "@/lib/storage";
import { toolRegistry } from "@/lib/tool-registry";
import { getUserContextForPrompt } from "@/lib/user";
import type {
  AssetReference,
  Context,
  ToolCall,
  Trace,
  TraceAICall,
  TraceContext,
  TraceToolCall,
} from "@/schemas/prompt-params";
import type { ToolCallSummary } from "@/schemas/prompt-responses";

export class ConversationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationNotFoundError";
  }
}

const logger = createChildLogger("prompt-service");

/**
 * Creates a deep copy of an object, safe for tracing
 * Uses JSON serialization which handles most cases but excludes functions, undefined, symbols
 */
function deepCopyForTrace(obj: any): any {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to deep copy object for trace, using shallow copy",
    );
    return { ...obj };
  }
}

/**
 * Fetches the text content for a specific asset reference
 * @param assetRef - The asset reference containing type and id
 * @param userId - The user ID for authorization
 * @returns The extracted text content of the asset, or null if not available
 */
export async function fetchAssetContent(
  assetRef: AssetReference,
  userId: string,
): Promise<string | null> {
  try {
    logger.debug(
      { assetType: assetRef.type, assetId: assetRef.id, userId },
      "Fetching asset content",
    );

    switch (assetRef.type) {
      case "note": {
        // Notes store content directly in the database
        const [note] = await db
          .select({ content: notes.content })
          .from(notes)
          .where(and(eq(notes.id, assetRef.id), eq(notes.userId, userId)));

        if (!note) {
          logger.warn({ assetId: assetRef.id, userId }, "Note not found");
          return null;
        }

        return note.content || null;
      }

      case "bookmark": {
        // Bookmarks store content in storage files via extractedTxtStorageId or directly in extractedText
        const [bookmark] = await db
          .select({
            extractedTxtStorageId: bookmarks.extractedTxtStorageId,
            extractedText: bookmarks.extractedText,
            title: bookmarks.title,
            description: bookmarks.description,
          })
          .from(bookmarks)
          .where(
            and(eq(bookmarks.id, assetRef.id), eq(bookmarks.userId, userId)),
          );

        if (!bookmark) {
          logger.warn({ assetId: assetRef.id, userId }, "Bookmark not found");
          return null;
        }

        // Try to get content from extractedText field first (faster)
        if (bookmark.extractedText) {
          logger.debug(
            {
              assetId: assetRef.id,
              contentLength: bookmark.extractedText.length,
            },
            "Retrieved bookmark content from database field",
          );
          return bookmark.extractedText;
        }

        // Try to get content from storage file
        if (bookmark.extractedTxtStorageId) {
          try {
            const { stream } = await objectStorage.getStream(
              bookmark.extractedTxtStorageId,
            );
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
              chunks.push(Buffer.from(chunk));
            }
            const content = Buffer.concat(chunks).toString("utf-8");
            logger.debug(
              { assetId: assetRef.id, contentLength: content.length },
              "Retrieved bookmark content from storage",
            );
            return content;
          } catch (storageError) {
            logger.warn(
              {
                assetId: assetRef.id,
                storageError:
                  storageError instanceof Error
                    ? storageError.message
                    : "Unknown error",
              },
              "Failed to retrieve bookmark content from storage, falling back to title/description",
            );
          }
        }

        // Fallback to title and description if no content file
        const fallbackContent = [bookmark.title, bookmark.description]
          .filter(Boolean)
          .join("\n\n");
        return fallbackContent || null;
      }

      case "document": {
        // Documents store content in storage files via extractedMdStorageId/extractedTxtStorageId or directly in extractedText
        const [document] = await db
          .select({
            extractedMdStorageId: documents.extractedMdStorageId,
            extractedTxtStorageId: documents.extractedTxtStorageId,
            extractedText: documents.extractedText,
            title: documents.title,
            description: documents.description,
          })
          .from(documents)
          .where(
            and(eq(documents.id, assetRef.id), eq(documents.userId, userId)),
          );

        if (!document) {
          logger.warn(
            { assetId: assetRef.id, userId },
            "Document not found in database",
          );
          return null;
        }

        logger.info(
          {
            assetId: assetRef.id,
            userId,
            hasExtractedMdStorageId: !!document.extractedMdStorageId,
            hasExtractedTxtStorageId: !!document.extractedTxtStorageId,
            hasExtractedText: !!document.extractedText,
            extractedTextLength: document.extractedText?.length || 0,
            title: document.title,
            description: document.description,
          },
          "Found document in database, attempting to fetch content",
        );

        // Try to get markdown content first (from Docling processor)
        if (document.extractedMdStorageId) {
          try {
            const { stream } = await objectStorage.getStream(
              document.extractedMdStorageId,
            );
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
              chunks.push(Buffer.from(chunk));
            }
            const markdownContent = Buffer.concat(chunks).toString("utf-8");
            logger.debug(
              {
                assetId: assetRef.id,
                contentLength: markdownContent.length,
              },
              "Retrieved document markdown content from storage",
            );
            return markdownContent;
          } catch (markdownError) {
            logger.warn(
              {
                assetId: assetRef.id,
                storageError:
                  markdownError instanceof Error
                    ? markdownError.message
                    : "Unknown error",
              },
              "Failed to retrieve document markdown content from storage, trying plain text",
            );
          }
        }

        // Try to get plain text content from storage file
        if (document.extractedTxtStorageId) {
          try {
            const { stream } = await objectStorage.getStream(
              document.extractedTxtStorageId,
            );
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
              chunks.push(Buffer.from(chunk));
            }
            const textContent = Buffer.concat(chunks).toString("utf-8");
            logger.debug(
              {
                assetId: assetRef.id,
                contentLength: textContent.length,
              },
              "Retrieved document text content from storage",
            );
            return textContent;
          } catch (textError) {
            logger.warn(
              {
                assetId: assetRef.id,
                storageError:
                  textError instanceof Error
                    ? textError.message
                    : "Unknown error",
              },
              "Failed to retrieve document text content from storage, falling back to database field",
            );
          }
        }

        // Fallback to extracted text in database
        if (document.extractedText) {
          logger.info(
            {
              assetId: assetRef.id,
              contentLength: document.extractedText.length,
              contentPreview:
                document.extractedText.substring(0, 200) +
                (document.extractedText.length > 200 ? "..." : ""),
            },
            "Using extracted text from database",
          );
          return document.extractedText;
        }

        // Final fallback to title and description
        const fallbackContent = [document.title, document.description]
          .filter(Boolean)
          .join("\n\n");

        logger.info(
          {
            assetId: assetRef.id,
            fallbackContentLength: fallbackContent?.length || 0,
            title: document.title,
            description: document.description,
          },
          "Using title/description as final fallback for document content",
        );

        return fallbackContent || null;
      }

      case "photo": {
        // Photos store OCR text in the database
        const [photo] = await db
          .select({
            ocrText: photos.ocrText,
            title: photos.title,
            description: photos.description,
          })
          .from(photos)
          .where(and(eq(photos.id, assetRef.id), eq(photos.userId, userId)));

        if (!photo) {
          logger.warn({ assetId: assetRef.id, userId }, "Photo not found");
          return null;
        }

        // Combine OCR text with title and description
        const contentParts = [
          photo.title,
          photo.description,
          photo.ocrText,
        ].filter(Boolean);
        return contentParts.length > 0 ? contentParts.join("\n\n") : null;
      }

      case "task": {
        // Tasks store content in title and description
        const [task] = await db
          .select({
            title: tasks.title,
            description: tasks.description,
          })
          .from(tasks)
          .where(and(eq(tasks.id, assetRef.id), eq(tasks.userId, userId)));

        if (!task) {
          logger.warn({ assetId: assetRef.id, userId }, "Task not found");
          return null;
        }

        const contentParts = [task.title, task.description].filter(Boolean);
        return contentParts.length > 0 ? contentParts.join("\n\n") : null;
      }

      default:
        logger.warn(
          { assetType: assetRef.type, assetId: assetRef.id },
          "Unknown asset type",
        );
        return null;
    }
  } catch (error) {
    logger.error(
      {
        assetType: assetRef.type,
        assetId: assetRef.id,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error fetching asset content",
    );
    return null;
  }
}

/**
 * Build the system prompt with user context and current date/time
 * @param userContext - User profile context for personalizing the prompt
 * @param assetContents - Optional array of asset contents to include in the prompt
 * @param includeToolInstructions - Whether to include tool calling instructions (false when assets are provided)
 * @returns The complete system prompt string
 */
export function buildSystemPrompt(
  userContext: {
    displayName: string | null;
    fullName: string | null;
    bio: string | null;
    timezone: string | null;
    city: string | null;
    country: string | null;
  },
  assetContents?: Array<{ type: string; id: string; content: string }>,
  includeToolInstructions: boolean = true,
  isBackgroundTaskExecution: boolean = false,
) {
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
  if (userContext.displayName) {
    personalizedGreeting = `You are a helpful assistant talking to ${userContext.displayName}.`;
  }

  // Add user context information
  let userContextInfo = "";
  if (
    userContext.displayName ||
    userContext.fullName ||
    userContext.bio ||
    userContext.city ||
    userContext.country
  ) {
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

Analyze the task request. If it requires searching for information or counting items, invoke the appropriate tool from the ones listed below.
Dates must be ISO strings (YYYY-MM-DD).

\`\`\`typescript
${toolRegistry.getToolSignatures()}
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
`;
  }

  // If we don't need tool instructions (e.g., when assets are provided), return simple prompt
  if (!includeToolInstructions) {
    return `${basePrompt}

Please provide a helpful and informative response based on the user's question and any referenced content above. Be conversational and focus on directly answering their question.`;
  }

  // Full prompt with tool calling instructions
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
${toolRegistry.getToolSignatures()}
\`\`\`
`;
}

/**
 * Execute a tool call and return the result
 * @param toolCall The tool call to execute
 * @param userId The ID of the user making the request
 * @returns The result of the tool call
 */
export async function executeToolCall(
  toolCall: ToolCall,
  userId: string,
): Promise<any> {
  const { functionName, arguments: args = {} } = toolCall;

  logger.debug({ functionName, args, userId }, "Executing tool call");

  try {
    return await toolRegistry.executeTool(functionName, userId, args);
  } catch (error: unknown) {
    logger.error(
      {
        functionName,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error executing tool call",
    );
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    throw new Error(`Failed to execute ${functionName}: ${errorMessage}`);
  }
}

/**
 * Process a prompt request with optional asset context and tracing
 * @param userId - The authenticated user ID
 * @param prompt - The user's prompt text
 * @param context - Optional context containing assets to reference
 * @param requestId - Request ID for logging
 * @param trace - Whether to enable tracing for debugging/testing
 * @param conversationId - Optional conversation ID for multi-turn conversations
 * @param enableThinking - Whether to enable thinking mode for supported models
 * @returns The AI response object with optional trace data
 */
export async function processPromptRequest(
  userId: string,
  prompt: string,
  context?: Context,
  requestId?: string,
  trace: boolean = false,
  conversationId?: string,
  enableThinking?: boolean,
): Promise<{
  type: "text_response";
  response: string;
  requestId: string;
  conversationId?: string;
  thinkingContent?: string | null;
  toolCalls?: ToolCallSummary[];
  trace?: Trace;
}> {
  const startTime = Date.now();
  logger.info(
    {
      requestId,
      userId,
      traceEnabled: trace,
      hasConversationId: !!conversationId,
    },
    "Processing prompt request",
  );

  // Handle conversation context if conversationId is provided
  let conversation: ConversationWithMessages | null = null;
  let isNewConversation = false;

  if (conversationId) {
    logger.info(
      { requestId, userId, conversationId },
      "Loading conversation context",
    );
    conversation = await getConversationWithMessages(conversationId, userId);

    if (!conversation) {
      logger.warn(
        { requestId, userId, conversationId },
        "Conversation not found",
      );
      throw new ConversationNotFoundError("Conversation not found");
    }

    logger.info(
      {
        requestId,
        userId,
        conversationId,
        messageCount: conversation.messageCount,
      },
      "Loaded conversation context",
    );
  }

  // Initialize trace data if enabled or if AI prompt logging is enabled
  const shouldTrace = trace || aiPromptLogger.isLoggingEnabled();
  const traceData: Trace | undefined = shouldTrace
    ? {
        enabled: true,
        requestBody: {}, // Will be filled by route handler
        context: {} as TraceContext,
        aiCalls: [],
        toolCalls: [],
        summary: {
          totalExecutionTimeMs: 0,
          totalAiCalls: 0,
          totalToolCalls: 0,
          totalAiResponseTimeMs: 0,
          totalToolExecutionTimeMs: 0,
        },
        responseBody: {}, // Will be filled before returning
      }
    : undefined;

  // Capture AI provider context for tracing
  if (traceData) {
    try {
      const aiProvider = getAIProviderInfo("backend");
      traceData.context = {
        aiProvider: aiProvider.name,
        aiBaseURL: aiProvider.baseURL,
        aiModel: aiProvider.model,
        hasApiKey: !!aiProvider.apiKey,
      };
    } catch (error) {
      logger.warn(
        { requestId, userId, error },
        "Failed to get AI provider info for trace",
      );
      traceData.context = {
        aiProvider: "unknown",
        aiBaseURL: "unknown",
        aiModel: "unknown",
        hasApiKey: false,
      };
    }
  }

  let aiCallIndex = 0;
  let toolCallIndex = 0;

  // Separate tool call tracking for UI display (independent of trace)
  const toolCallSummaries: ToolCallSummary[] = [];

  // Function to capture AI call traces
  const captureAITrace = (aiTrace: TraceAICall) => {
    if (traceData) {
      traceData.aiCalls.push({
        callIndex: aiTrace.callIndex,
        timestamp: aiTrace.timestamp,
        requestBody: aiTrace.requestBody,
        responseBody: aiTrace.responseBody,
        durationMs: aiTrace.durationMs,
        usage: aiTrace.usage,
        estimatedInputTokens: aiTrace.estimatedInputTokens,
      });
      traceData.summary.totalAiCalls++;
      traceData.summary.totalAiResponseTimeMs += aiTrace.durationMs as number;

      // Log the full request/response for debugging
      logger.info(
        {
          requestId,
          userId,
          aiCallIndex: aiTrace.callIndex,
          aiCallTimestamp: aiTrace.timestamp,
          aiCallDurationMs: aiTrace.durationMs,
          requestBodyFull: aiTrace.requestBody,
          responseBodyFull: aiTrace.responseBody,
          usage: aiTrace.usage,
          estimatedInputTokens: aiTrace.estimatedInputTokens,
        },
        "🔍 TRACE: Full AI request/response captured",
      );
    }
  };

  // Function to capture tool call traces
  const captureToolTrace = (toolTrace: TraceToolCall) => {
    if (traceData) {
      traceData.toolCalls.push(toolTrace);
      traceData.summary.totalToolCalls++;
      traceData.summary.totalToolExecutionTimeMs += toolTrace.durationMs;
    }
  };

  // Function to add tool call to separate UI tracking (always enabled)
  const addToolCallSummary = (toolTrace: TraceToolCall) => {
    // Create a human-readable summary of the result
    let resultSummary: string | undefined;
    if (toolTrace.error) {
      resultSummary = `Error: ${toolTrace.error}`;
    } else if (toolTrace.result) {
      // Create a brief summary based on the result type
      if (Array.isArray(toolTrace.result)) {
        resultSummary = `Found ${toolTrace.result.length} items`;
      } else if (
        typeof toolTrace.result === "object" &&
        toolTrace.result !== null
      ) {
        // For object results, provide a generic summary
        const keys = Object.keys(toolTrace.result);
        if (keys.length > 0) {
          resultSummary = `Retrieved data with ${keys.length} field${keys.length === 1 ? "" : "s"}`;
        } else {
          resultSummary = "Operation completed successfully";
        }
      } else if (typeof toolTrace.result === "string") {
        // Truncate long string results
        resultSummary =
          toolTrace.result.length > 100
            ? toolTrace.result.substring(0, 100) + "..."
            : toolTrace.result;
      } else {
        resultSummary = "Operation completed successfully";
      }
    } else {
      resultSummary = "Operation completed";
    }

    const summary: ToolCallSummary = {
      functionName: toolTrace.functionName,
      executionTimeMs: toolTrace.durationMs,
      success: !toolTrace.error,
      error: toolTrace.error,
      arguments: toolTrace.arguments,
      resultSummary,
    };

    toolCallSummaries.push(summary);
  };

  try {
    // Get user context for personalizing the prompt
    const userContext = await getUserContextForPrompt(userId);
    logger.debug({ requestId, userId }, "User context for prompt loaded");

    // Fetch asset contents if provided in context
    const assetContents: Array<{ type: string; id: string; content: string }> =
      [];
    if (context?.assets && context.assets.length > 0) {
      logger.info(
        { requestId, userId, assetCount: context.assets.length },
        "Fetching content for provided assets",
      );

      for (const assetRef of context.assets) {
        try {
          const content = await fetchAssetContent(assetRef, userId);
          assetContents.push({
            type: assetRef.type,
            id: assetRef.id,
            content: content || `[${assetRef.type} content not available]`,
          });
          logger.info(
            {
              requestId,
              userId,
              assetType: assetRef.type,
              assetId: assetRef.id,
              contentLength: content?.length || 0,
              contentPreview: content
                ? content.substring(0, 200) +
                  (content.length > 200 ? "..." : "")
                : null,
            },
            "Retrieved asset content",
          );
        } catch (assetError) {
          logger.warn(
            {
              requestId,
              userId,
              assetType: assetRef.type,
              assetId: assetRef.id,
              error:
                assetError instanceof Error
                  ? assetError.message
                  : "Unknown error",
            },
            "Failed to fetch asset content, skipping",
          );
          assetContents.push({
            type: assetRef.type,
            id: assetRef.id,
            content: `[Error retrieving ${assetRef.type} content]`,
          });
        }
      }

      logger.info(
        {
          requestId,
          userId,
          successfulAssets: assetContents.filter(
            (a) => !a.content.startsWith("["),
          ).length,
          totalAssets: context.assets.length,
        },
        "Asset content fetching completed",
      );
    }

    // Determine if we should include tool instructions
    // For background task execution, always include tools even with assets
    const hasAssets = assetContents.length > 0;
    const isBackgroundTaskExecution = context?.backgroundTaskExecution === true;
    const includeToolInstructions = !hasAssets || isBackgroundTaskExecution;

    const systemPrompt = buildSystemPrompt(
      userContext,
      assetContents,
      includeToolInstructions,
      isBackgroundTaskExecution,
    );
    logger.info(
      {
        requestId,
        userId,
        systemPromptLength: systemPrompt.length,
        systemPromptPreview: systemPrompt,
        //systemPrompt.substring(0, 500) +
        //(systemPrompt.length > 500 ? "..." : ""),
        hasAssetContents: hasAssets,
        assetContentsCount: assetContents.length,
        includeToolInstructions: includeToolInstructions,
        promptType: hasAssets ? "simple_with_assets" : "full_with_tools",
      },
      "Built personalized system prompt",
    );

    // Build messages array - handle conversation context
    const messages: AIMessage[] = [];

    if (conversation) {
      // For conversations, build from conversation history
      const conversationMessages = await buildAIMessageArray(
        conversation.id,
        true, // Include system prompt
        systemPrompt,
      );
      messages.push(...conversationMessages);

      // Add the new user message
      messages.push({ role: "user", content: prompt });

      logger.info(
        {
          requestId,
          userId,
          conversationId: conversation.id,
          messagesCount: messages.length,
          conversationMessageCount: conversation.messageCount,
          hasAssetContents: hasAssets,
          promptType: hasAssets
            ? "conversation_with_assets"
            : "conversation_with_tools",
        },
        "Conversation messages prepared for AI",
      );
    } else {
      // For single requests, use the original approach
      messages.push({ role: "system", content: systemPrompt });
      messages.push({ role: "user", content: prompt });

      logger.info(
        {
          requestId,
          userId,
          messagesCount: messages.length,
          systemPromptLength: systemPrompt.length,
          userPrompt: prompt,
          hasAssetContents: hasAssets,
          promptType: hasAssets ? "simple_with_assets" : "full_with_tools",
        },
        "Initial messages for AI prepared",
      );
    }

    let rawAssistantResponseContent = "";
    let assistantReasoning: string | undefined; // Track reasoning from AI provider

    // For simple prompts with assets, we only need one iteration since no tool calling
    const maxIterations = hasAssets ? 1 : 10;
    let currentIteration = 0;

    while (currentIteration < maxIterations) {
      currentIteration++;
      logger.info(
        { requestId, userId, currentIteration, maxIterations },
        "AI iteration starting",
      );

      try {
        // Use the unified AI client with enhanced token tracking and tracing
        const aiOptions = {
          temperature: 0.1,
          maxTokens: 2000,
          timeout: 180000, // 3 minute timeout
          enableThinking,
          trace: traceData
            ? {
                enabled: true,
                callIndex: aiCallIndex++,
                onTraceCapture: captureAITrace,
              }
            : undefined,
        };

        const aiResponse = await callAI(messages, "backend", aiOptions);

        const assistantContent = aiResponse.content;
        assistantReasoning = aiResponse.reasoning; // Extract reasoning field from AI provider
        rawAssistantResponseContent = assistantContent;

        // Log token usage information for this iteration
        if (aiResponse.usage) {
          logger.info(
            {
              requestId,
              userId,
              currentIteration,
              tokenUsage: {
                promptTokens: aiResponse.usage.prompt_tokens,
                completionTokens: aiResponse.usage.completion_tokens,
                totalTokens: aiResponse.usage.total_tokens,
                estimatedVsActual: aiResponse.estimatedInputTokens
                  ? `Estimated: ${aiResponse.estimatedInputTokens}, Actual: ${aiResponse.usage.prompt_tokens || "unknown"}`
                  : "No estimation available",
                accuracy:
                  aiResponse.usage.prompt_tokens &&
                  aiResponse.estimatedInputTokens
                    ? `${Math.round((aiResponse.estimatedInputTokens / aiResponse.usage.prompt_tokens) * 100)}%`
                    : "N/A",
                contextUtilization: aiResponse.usage.prompt_tokens
                  ? `${Math.round((aiResponse.usage.prompt_tokens / 2000) * 100)}%`
                  : "Unknown",
              },
            },
            "Token usage for AI iteration",
          );
        } else {
          logger.info(
            {
              requestId,
              userId,
              currentIteration,
              estimatedTokens: aiResponse.estimatedInputTokens,
              note: "No usage data returned by AI provider",
            },
            "AI iteration completed (no usage data available)",
          );
        }

        logger.debug(
          { requestId, userId, currentIteration },
          "Raw assistant content processed",
        );
        messages.push({ role: "assistant", content: assistantContent });
        logger.debug(
          {
            requestId,
            userId,
            currentIteration,
            messagesCount: messages.length,
          },
          "Messages updated after assistant response",
        );

        let toolCalls: ToolCall[] = [];
        let isFinalResponseJson = false;

        // For simple prompts with assets, skip tool call parsing - treat everything as final response
        if (hasAssets) {
          logger.info(
            { requestId, userId, currentIteration },
            "Using simple prompt with assets - treating response as final text",
          );
          break; // Exit loop immediately for simple prompts
        }

        try {
          const parseResult = parseTextToolContent(
            assistantContent,
            assistantReasoning,
          );

          logger.info(
            {
              requestId,
              userId,
              currentIteration,
              hasThinking: !!parseResult.thinkingContent,
              hasTextResponse: !!parseResult.textResponse,
              hasToolCalls: !!parseResult.toolCalls?.length,
              thinkingSource: parseResult.thinkingSource || "none",
            },
            "Parsed assistant content with text parser",
          );

          // Log thinking content if present
          if (parseResult.thinkingContent) {
            logger.info(
              {
                requestId,
                userId,
                currentIteration,
                thinkingLength: parseResult.thinkingContent.length,
                thinkingPreview:
                  parseResult.thinkingContent.substring(0, 200) +
                  (parseResult.thinkingContent.length > 200 ? "..." : ""),
              },
              "Extracted thinking content from AI response",
            );
          }

          // Check if we have a final response
          const finalResponse = extractFinalResponse(parseResult);
          if (finalResponse) {
            logger.debug(
              { requestId, userId, currentIteration },
              "Detected final response from LLM parser",
            );
            isFinalResponseJson = true;
          }

          // Extract tool calls
          const extractedToolCalls = extractToolCalls(parseResult);
          if (extractedToolCalls.length > 0) {
            logger.info(
              {
                requestId,
                userId,
                currentIteration,
                toolCallsCount: extractedToolCalls.length,
              },
              "Detected tool calls from LLM parser",
            );
            toolCalls = extractedToolCalls.map((tc) => ({
              functionName: tc.functionName,
              arguments: tc.arguments,
            }));
          }

          // If no structured content found, try legacy parsing as fallback
          if (
            !parseResult.hasToolCalls &&
            !finalResponse &&
            extractedToolCalls.length === 0
          ) {
            logger.debug(
              { requestId, userId, currentIteration },
              "No structured content found, treating as plain text final response",
            );
            break;
          }

          if (isFinalResponseJson) {
            logger.debug(
              { requestId, userId, currentIteration },
              "Breaking loop: Final structured response received from LLM parser",
            );
            break;
          }
          if (toolCalls.length === 0 && !isFinalResponseJson) {
            logger.debug(
              { requestId, userId, currentIteration },
              "Breaking loop: No tool calls and not a final response from LLM parser",
            );
            break;
          }
        } catch (error) {
          logger.warn(
            {
              requestId,
              userId,
              currentIteration,
              error: error instanceof Error ? error.message : "Unknown error",
            },
            "Error parsing assistant content with LLM parser, treating as plain text",
          );
          toolCalls = [];
          break;
        }

        if (toolCalls.length === 0) {
          logger.debug(
            { requestId, userId, currentIteration },
            "Breaking loop: No tool calls identified after JSON parsing attempts",
          );
          break;
        }

        const toolResults = [];
        let hasToolError = false;
        logger.info(
          {
            requestId,
            userId,
            currentIteration,
            toolCallsCount: toolCalls.length,
          },
          "Processing tool calls",
        );

        for (const toolCall of toolCalls) {
          logger.debug(
            { requestId, userId, currentIteration, toolCall },
            "Processing tool call",
          );

          const toolStartTime = Date.now();
          try {
            const result = await executeToolCall(toolCall, userId);
            const toolEndTime = Date.now();
            const toolDurationMs = toolEndTime - toolStartTime;

            logger.debug(
              {
                requestId,
                userId,
                currentIteration,
                functionName: toolCall.functionName,
                durationMs: toolDurationMs,
              },
              "Tool call executed successfully",
            );

            toolResults.push({
              tool_name: toolCall.functionName,
              result: result,
            });

            // Capture tool trace
            const toolTraceData = {
              callIndex: toolCallIndex++,
              timestamp: new Date(toolStartTime).toISOString(),
              functionName: toolCall.functionName,
              arguments: deepCopyForTrace(toolCall.arguments), // Deep copy arguments
              result: deepCopyForTrace(result), // Deep copy result
              durationMs: toolDurationMs,
            };
            captureToolTrace(toolTraceData);
            addToolCallSummary(toolTraceData);
          } catch (error) {
            const toolEndTime = Date.now();
            const toolDurationMs = toolEndTime - toolStartTime;

            logger.error(
              {
                requestId,
                userId,
                currentIteration,
                functionName: toolCall.functionName,
                durationMs: toolDurationMs,
                error: error instanceof Error ? error.message : "Unknown error",
                stack: error instanceof Error ? error.stack : undefined,
              },
              "Error executing tool call",
            );

            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            toolResults.push({
              tool_name: toolCall.functionName,
              error: errorMessage,
              result: null,
            });

            // Capture tool error trace
            const toolErrorTraceData = {
              callIndex: toolCallIndex++,
              timestamp: new Date(toolStartTime).toISOString(),
              functionName: toolCall.functionName,
              arguments: deepCopyForTrace(toolCall.arguments), // Deep copy arguments
              result: null,
              error: errorMessage,
              durationMs: toolDurationMs,
            };
            captureToolTrace(toolErrorTraceData);
            addToolCallSummary(toolErrorTraceData);

            hasToolError = true;
          }
        }

        const toolResultsMessageContent = `Tool results: ${JSON.stringify(toolResults, null, 2)}`;
        messages.push({ role: "user", content: toolResultsMessageContent });
        logger.debug(
          { requestId, userId, currentIteration },
          "Added tool results to messages",
        );

        if (hasToolError && currentIteration === 1) {
          logger.debug(
            { requestId, userId, currentIteration },
            "Tool errors detected on first iteration, adding guidance message for AI",
          );
          messages.push({
            role: "system",
            content:
              "There was an error with one or more tool calls. Please respond to the user with a helpful message instead of attempting more tool calls.",
          });
        }
      } catch (aiError) {
        logger.error(
          {
            requestId,
            userId,
            currentIteration,
            error: aiError instanceof Error ? aiError.message : "Unknown error",
            stack: aiError instanceof Error ? aiError.stack : undefined,
          },
          "Error calling AI API in iteration",
        );
        throw aiError;
      }
    } // End of while loop

    logger.info(
      { requestId, userId, finalIteration: currentIteration },
      "AI interaction loop finished",
    );

    let finalAiOutput: any;
    let finalThinkingContent: string | null = null;
    let cleanedFinalContent = rawAssistantResponseContent.trim();

    // For simple prompts with assets, always treat response as plain text
    if (hasAssets) {
      // Check for and extract <think> tags even for simple prompts
      let assetThinkingContent: string | null = null;
      const thinkRegex = /<think>\s*([\s\S]*?)\s*<\/think>/i;
      const thinkMatch = cleanedFinalContent.match(thinkRegex);
      if (thinkMatch && thinkMatch[1]) {
        assetThinkingContent = thinkMatch[1].trim();
        finalThinkingContent = assetThinkingContent; // Capture for final result
        // Remove the entire <think>...</think> block from the content
        cleanedFinalContent = cleanedFinalContent
          .replace(thinkRegex, "")
          .trim();
        logger.info(
          {
            requestId,
            userId,
            assetThinkingLength: assetThinkingContent.length,
            assetThinkingPreview:
              assetThinkingContent.substring(0, 200) +
              (assetThinkingContent.length > 200 ? "..." : ""),
            remainingContent:
              cleanedFinalContent.substring(0, 200) +
              (cleanedFinalContent.length > 200 ? "..." : ""),
          },
          "Extracted thinking content from simple prompt with assets",
        );
      }

      logger.info(
        {
          requestId,
          userId,
          responseLength: cleanedFinalContent.length,
          responsePreview:
            cleanedFinalContent.substring(0, 200) +
            (cleanedFinalContent.length > 200 ? "..." : ""),
          hasThinking: !!assetThinkingContent,
        },
        "Simple prompt with assets - treating response as plain text",
      );
      finalAiOutput = {
        type: "text_response",
        response: cleanedFinalContent,
      };
    } else {
      // Full tool-enabled prompt logic - use LLM parser
      try {
        const finalParseResult = parseTextToolContent(
          rawAssistantResponseContent,
          assistantReasoning,
        );

        logger.info(
          {
            requestId,
            userId,
            hasThinking: !!finalParseResult.thinkingContent,
            hasTextResponse: !!finalParseResult.textResponse,
            hasToolCalls: !!finalParseResult.toolCalls?.length,
            thinkingSource: finalParseResult.thinkingSource || "none",
          },
          "Parsed final assistant response with text parser",
        );

        // Use thinking content from parser (which handles reasoning field precedence internally)
        if (finalParseResult.thinkingContent) {
          finalThinkingContent = finalParseResult.thinkingContent;
          logger.info(
            {
              requestId,
              userId,
              thinkingLength: finalParseResult.thinkingContent.length,
              thinkingPreview:
                finalParseResult.thinkingContent.substring(0, 200) +
                (finalParseResult.thinkingContent.length > 200 ? "..." : ""),
              thinkingSource: finalParseResult.thinkingSource,
            },
            `Using thinking content from ${finalParseResult.thinkingSource || "parser"}`,
          );
        }

        // Try to extract final response
        const finalResponse = extractFinalResponse(finalParseResult);
        if (finalResponse) {
          finalAiOutput = {
            type: "text_response",
            response: finalResponse,
          };
          logger.info(
            {
              requestId,
              userId,
              responseLength: finalResponse.length,
              responsePreview:
                finalResponse.substring(0, 200) +
                (finalResponse.length > 200 ? "..." : ""),
            },
            "Successfully extracted final response from LLM parser",
          );
        } else {
          // If no structured response found, use cleaned content as fallback
          logger.warn(
            {
              requestId,
              userId,
              rawContentLength: rawAssistantResponseContent.length,
              rawContentPreview: rawAssistantResponseContent.substring(0, 500),
            },
            "No final response found in LLM parser, using raw content as fallback",
          );
          finalAiOutput = {
            type: "text_response",
            response: cleanedFinalContent,
          };
        }

        // Check for tool calls that might need processing
        const finalToolCalls = extractToolCalls(finalParseResult);
        if (finalToolCalls.length > 0) {
          logger.info(
            {
              requestId,
              userId,
              toolCallsCount: finalToolCalls.length,
            },
            "Found tool calls in final response that need processing",
          );
          // Override finalAiOutput to be tool calls for processing
          finalAiOutput = finalToolCalls.map((tc) => ({
            functionName: tc.functionName,
            arguments: tc.arguments,
          }));
        }
      } catch (e) {
        logger.warn(
          {
            requestId,
            userId,
            error: e instanceof Error ? e.message : "Unknown error",
            rawContentLength: rawAssistantResponseContent.length,
            rawContentPreview: rawAssistantResponseContent.substring(0, 500),
          },
          "Error parsing final response with LLM parser, falling back to plain text",
        );

        // Fallback: use the cleaned content as final response
        finalAiOutput = {
          type: "text_response",
          response: cleanedFinalContent,
        };
      }
    }

    // Handle case where AI returns tool calls wrapped in markdown at the very end
    if (
      (Array.isArray(finalAiOutput) &&
        finalAiOutput.length > 0 &&
        finalAiOutput[0].functionName) ||
      (finalAiOutput.functionName &&
        typeof finalAiOutput.functionName === "string")
    ) {
      // Convert single tool call to array for consistent processing
      const toolCallsToProcess = Array.isArray(finalAiOutput)
        ? finalAiOutput
        : [finalAiOutput];
      logger.info(
        {
          requestId,
          userId,
          toolCallsCount: toolCallsToProcess.length,
          toolCalls: toolCallsToProcess,
        },
        "Final response contains tool calls wrapped in markdown - processing them",
      );

      // Process these final tool calls
      const toolResults = [];

      for (const toolCall of toolCallsToProcess) {
        logger.debug(
          { requestId, userId, toolCall },
          "Processing final tool call",
        );

        const toolStartTime = Date.now();
        try {
          const result = await executeToolCall(toolCall, userId);
          const toolEndTime = Date.now();
          const toolDurationMs = toolEndTime - toolStartTime;

          logger.debug(
            {
              requestId,
              userId,
              functionName: toolCall.functionName,
              durationMs: toolDurationMs,
            },
            "Final tool call executed successfully",
          );

          toolResults.push({
            tool_name: toolCall.functionName,
            result: result,
          });

          // Capture final tool trace
          const finalToolTraceData = {
            callIndex: toolCallIndex++,
            timestamp: new Date(toolStartTime).toISOString(),
            functionName: toolCall.functionName,
            arguments: deepCopyForTrace(toolCall.arguments), // Deep copy arguments
            result: deepCopyForTrace(result), // Deep copy result
            durationMs: toolDurationMs,
          };
          captureToolTrace(finalToolTraceData);
          addToolCallSummary(finalToolTraceData);
        } catch (error) {
          const toolEndTime = Date.now();
          const toolDurationMs = toolEndTime - toolStartTime;

          logger.error(
            {
              requestId,
              userId,
              functionName: toolCall.functionName,
              durationMs: toolDurationMs,
              error: error instanceof Error ? error.message : "Unknown error",
              stack: error instanceof Error ? error.stack : undefined,
            },
            "Error executing final tool call",
          );

          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          toolResults.push({
            tool_name: toolCall.functionName,
            error: errorMessage,
            result: null,
          });

          // Capture final tool error trace
          const finalToolErrorTraceData = {
            callIndex: toolCallIndex++,
            timestamp: new Date(toolStartTime).toISOString(),
            functionName: toolCall.functionName,
            arguments: deepCopyForTrace(toolCall.arguments), // Deep copy arguments
            result: null,
            error: errorMessage,
            durationMs: toolDurationMs,
          };
          captureToolTrace(finalToolErrorTraceData);
          addToolCallSummary(finalToolErrorTraceData);
        }
      }

      // Add tool results to messages and make one more AI call for final response
      const toolResultsMessageContent = `Tool results: ${JSON.stringify(toolResults, null, 2)}`;
      messages.push({ role: "user", content: toolResultsMessageContent });

      logger.info(
        { requestId, userId },
        "Making final AI call to get text response after processing tool calls",
      );

      try {
        const aiOptions = {
          temperature: 0.1,
          maxTokens: 2000,
          timeout: 180000,
          enableThinking,
          trace: traceData
            ? {
                enabled: true,
                callIndex: aiCallIndex++,
                onTraceCapture: captureAITrace,
              }
            : undefined,
        };

        const finalAiResponse = await callAI(messages, "backend", aiOptions);

        // Log final token usage
        if (finalAiResponse.usage) {
          logger.info(
            {
              requestId,
              userId,
              finalTokenUsage: {
                promptTokens: finalAiResponse.usage.prompt_tokens,
                completionTokens: finalAiResponse.usage.completion_tokens,
                totalTokens: finalAiResponse.usage.total_tokens,
                estimatedVsActual: finalAiResponse.estimatedInputTokens
                  ? `Estimated: ${finalAiResponse.estimatedInputTokens}, Actual: ${finalAiResponse.usage.prompt_tokens || "unknown"}`
                  : "No estimation available",
                accuracy:
                  finalAiResponse.usage.prompt_tokens &&
                  finalAiResponse.estimatedInputTokens
                    ? `${Math.round((finalAiResponse.estimatedInputTokens / finalAiResponse.usage.prompt_tokens) * 100)}%`
                    : "N/A",
              },
            },
            "Final AI call token usage",
          );
        }

        finalAiOutput = {
          type: "text_response",
          response: finalAiResponse.content,
        };
      } catch (finalAiError) {
        logger.error(
          {
            requestId,
            userId,
            error:
              finalAiError instanceof Error
                ? finalAiError.message
                : "Unknown error",
          },
          "Error in final AI call after tool processing",
        );
        finalAiOutput = {
          type: "text_response",
          response:
            "I processed your request and found relevant information, but encountered an issue generating the final response.",
        };
      }
    } else if (finalAiOutput.type !== "text_response") {
      logger.warn(
        { requestId, userId, outputType: finalAiOutput.type, finalAiOutput },
        "AI returned an unknown JSON structure or plain text. Defaulting to text_response",
      );
      finalAiOutput = {
        type: "text_response",
        response: cleanedFinalContent, // Use cleaned content, not raw content
      };
    }

    if (finalAiOutput.type !== "text_response") {
      logger.error(
        { requestId, userId, finalAiOutput },
        "Unknown final AI output type after all checks",
      );
      throw new Error("Unknown final AI output type");
    }

    // Calculate final trace summary
    const endTime = Date.now();
    if (traceData) {
      traceData.summary.totalExecutionTimeMs = endTime - startTime;
      // Set response body before adding trace (deep copy to avoid reference issues)
      traceData.responseBody = deepCopyForTrace({
        type: "text_response",
        response: finalAiOutput.response,
        requestId: requestId || `req_text_${Date.now()}`,
      });
    }

    // Save messages to conversation if we have a conversation context
    let finalConversationId = conversationId;

    if (conversation) {
      // Add user message to conversation
      await createMessage({
        conversationId: conversation.id,
        role: "user",
        content: prompt,
        metadata: { requestId, trace: traceData ? true : false },
      });

      // Add assistant response to conversation
      await createMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: finalAiOutput.response,
        thinkingContent: finalThinkingContent,
        toolCalls: toolCallSummaries.length > 0 ? toolCallSummaries : undefined,
        metadata: {
          requestId,
          trace: traceData ? true : false,
          tokenUsage: traceData?.summary || undefined,
        },
      });

      // Update conversation activity
      await updateConversationActivity(conversation.id, userId);

      logger.info(
        { requestId, userId, conversationId: conversation.id },
        "Saved messages to conversation",
      );
    } else if (!hasAssets) {
      // For new conversations (when no conversationId provided and no assets),
      // create a new conversation and save messages
      const title = generateConversationTitle(prompt);
      const newConversation = await createConversation({
        userId,
        title,
      });

      finalConversationId = newConversation.id;
      isNewConversation = true;

      // Add user message
      await createMessage({
        conversationId: newConversation.id,
        role: "user",
        content: prompt,
        metadata: { requestId, trace: traceData ? true : false },
      });

      // Add assistant response
      await createMessage({
        conversationId: newConversation.id,
        role: "assistant",
        content: finalAiOutput.response,
        thinkingContent: finalThinkingContent,
        toolCalls: toolCallSummaries.length > 0 ? toolCallSummaries : undefined,
        metadata: {
          requestId,
          trace: traceData ? true : false,
          tokenUsage: traceData?.summary || undefined,
        },
      });

      // Update conversation activity
      await updateConversationActivity(newConversation.id, userId);

      logger.info(
        { requestId, userId, conversationId: newConversation.id },
        "Created new conversation and saved messages",
      );
    }

    // Validate finalAiOutput structure before constructing result
    if (!finalAiOutput || typeof finalAiOutput !== "object") {
      logger.error(
        {
          requestId,
          userId,
          finalAiOutput: finalAiOutput,
          finalAiOutputType: typeof finalAiOutput,
        },
        "Invalid finalAiOutput structure detected",
      );
      throw new Error("Invalid AI output structure");
    }

    if (finalAiOutput.type !== "text_response") {
      logger.error(
        {
          requestId,
          userId,
          finalAiOutput,
          actualType: finalAiOutput.type,
        },
        "Unexpected finalAiOutput type",
      );
      throw new Error(`Unexpected AI output type: ${finalAiOutput.type}`);
    }

    if (typeof finalAiOutput.response !== "string") {
      logger.error(
        {
          requestId,
          userId,
          finalAiOutput,
          responseType: typeof finalAiOutput.response,
          responseValue: finalAiOutput.response,
        },
        "Invalid response field in finalAiOutput",
      );
      throw new Error("AI response field is not a string");
    }

    // Additional check: ensure response doesn't look like serialized JSON
    if (
      finalAiOutput.response.trim().startsWith("{") &&
      finalAiOutput.response.trim().endsWith("}")
    ) {
      logger.warn(
        {
          requestId,
          userId,
          responsePreview: finalAiOutput.response.substring(0, 300),
          responseLength: finalAiOutput.response.length,
        },
        "Warning: Response field appears to contain JSON string instead of plain text",
      );
    }

    logger.info(
      {
        requestId,
        userId,
        finalAiOutputType: finalAiOutput.type,
        responseLength: finalAiOutput.response.length,
        responsePreview:
          finalAiOutput.response.substring(0, 200) +
          (finalAiOutput.response.length > 200 ? "..." : ""),
      },
      "Final AI output validated successfully",
    );

    const result = {
      type: "text_response" as const,
      response: finalAiOutput.response,
      requestId: requestId || `req_text_${Date.now()}`,
      conversationId: finalConversationId,
      thinkingContent: finalThinkingContent,
      toolCalls: toolCallSummaries.length > 0 ? toolCallSummaries : undefined,
      trace: traceData,
    };

    // Log the interaction if logging is enabled and we have trace data
    if (aiPromptLogger.isLoggingEnabled() && traceData) {
      try {
        await aiPromptLogger.logInteraction(
          result.requestId,
          userId,
          prompt,
          context,
          traceData,
          {
            type: "text_response",
            response: finalAiOutput.response,
            thinkingContent: finalThinkingContent,
            toolCalls:
              toolCallSummaries.length > 0 ? toolCallSummaries : undefined,
          },
          {
            conversationId: finalConversationId,
            isStreaming: false,
            hasAssets: (context?.assets && context.assets.length > 0) || false,
            assetCount: context?.assets?.length || 0,
            enableThinking,
            startTime,
            endTime,
          },
          // No streamingData parameter for non-streaming responses
        );
      } catch (logError) {
        // Don't fail the request if logging fails, just log the error
        logger.warn(
          {
            requestId: result.requestId,
            userId,
            logError:
              logError instanceof Error
                ? logError.message
                : "Unknown logging error",
          },
          "Failed to log AI prompt interaction, continuing with response",
        );
      }
    }

    logger.info(
      {
        requestId,
        userId,
        conversationId: finalConversationId,
        isNewConversation,
        totalExecutionTimeMs: endTime - startTime,
        traceEnabled: trace,
        totalAiCalls: traceData?.summary.totalAiCalls || 0,
        totalToolCalls: traceData?.summary.totalToolCalls || 0,
      },
      "Prompt request processing completed",
    );

    return result;
  } catch (error) {
    const endTime = Date.now();
    if (traceData) {
      traceData.summary.totalExecutionTimeMs = endTime - startTime;
    }

    logger.error(
      {
        requestId,
        userId,
        totalExecutionTimeMs: endTime - startTime,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error processing prompt request",
    );
    throw error;
  }
}

// Streaming event types
export interface StreamEvent {
  type: "thought" | "tool-call" | "text-chunk" | "error" | "done";
  timestamp?: string;
  content?: string;
  name?: string;
  status?: "starting" | "executing" | "completed" | "error";
  arguments?: Record<string, any>;
  result?: any;
  error?: string;
  requestId?: string;
  conversationId?: string;
  totalTokens?: number;
  executionTimeMs?: number;
  responseType?: string; // For future extensibility: "text_response", "image_response", etc.
  thinkingContent?: string; // Final thinking content for "done" event
  toolCalls?: ToolCallSummary[]; // Final tool call summaries for "done" event
}

/**
 * Process a prompt request with streaming response using Server-Sent Events
 * @param userId - The authenticated user ID
 * @param prompt - The user's prompt text
 * @param context - Optional context containing assets to reference
 * @param requestId - Request ID for logging
 * @param trace - Whether to enable tracing for debugging/testing
 * @param conversationId - Optional conversation ID for multi-turn conversations
 * @param enableThinking - Whether to enable thinking mode for supported models
 * @returns ReadableStream of streaming events
 */
export async function processPromptRequestStream(
  userId: string,
  prompt: string,
  context?: Context,
  requestId?: string,
  trace: boolean = false,
  conversationId?: string,
  enableThinking?: boolean,
): Promise<ReadableStream<StreamEvent>> {
  const startTime = Date.now();
  logger.info(
    {
      requestId,
      userId,
      traceEnabled: trace,
      hasConversationId: !!conversationId,
    },
    "Processing streaming prompt request",
  );

  return new ReadableStream<StreamEvent>({
    async start(controller) {
      try {
        // Handle conversation context if conversationId is provided
        let conversation: ConversationWithMessages | null = null;
        let isNewConversation = false;

        if (conversationId) {
          logger.info(
            { requestId, userId, conversationId },
            "Loading conversation context for streaming",
          );
          conversation = await getConversationWithMessages(
            conversationId,
            userId,
          );

          if (!conversation) {
            logger.warn(
              { requestId, userId, conversationId },
              "Conversation not found for streaming",
            );
            controller.enqueue({
              type: "error",
              error: "Conversation not found",
              timestamp: new Date().toISOString(),
            });
            controller.close();
            return;
          }
        }

        // Initialize trace data if enabled or if AI prompt logging is enabled
        const shouldTrace = trace || aiPromptLogger.isLoggingEnabled();
        const traceData: Trace | undefined = shouldTrace
          ? {
              enabled: true,
              requestBody: {}, // Will be filled by route handler
              context: {} as TraceContext,
              aiCalls: [],
              toolCalls: [],
              summary: {
                totalExecutionTimeMs: 0,
                totalAiCalls: 0,
                totalToolCalls: 0,
                totalAiResponseTimeMs: 0,
                totalToolExecutionTimeMs: 0,
              },
              responseBody: {}, // Will be filled before returning
            }
          : undefined;

        // Capture AI provider context for tracing
        if (traceData) {
          try {
            const aiProvider = getAIProviderInfo("backend");
            traceData.context = {
              aiProvider: aiProvider.name,
              aiBaseURL: aiProvider.baseURL,
              aiModel: aiProvider.model,
              hasApiKey: !!aiProvider.apiKey,
            };
          } catch (error) {
            logger.warn(
              { requestId, userId, error },
              "Failed to get AI provider info for streaming trace",
            );
            traceData.context = {
              aiProvider: "unknown",
              aiBaseURL: "unknown",
              aiModel: "unknown",
              hasApiKey: false,
            };
          }
        }

        let aiCallIndex = 0;
        let toolCallIndex = 0;

        // Separate tool call tracking for UI display (independent of trace)
        const toolCallSummaries: ToolCallSummary[] = [];

        // Function to capture AI call traces
        const captureAITrace = (aiTrace: TraceAICall) => {
          if (traceData) {
            traceData.aiCalls.push({
              callIndex: aiTrace.callIndex,
              timestamp: aiTrace.timestamp,
              requestBody: aiTrace.requestBody,
              responseBody:
                typeof aiTrace.responseBody === "object" &&
                aiTrace.responseBody !== null
                  ? aiTrace.responseBody
                  : {},
              durationMs: aiTrace.durationMs,
              usage: aiTrace.usage,
              estimatedInputTokens: aiTrace.estimatedInputTokens,
            });
            traceData.summary.totalAiCalls++;
            traceData.summary.totalAiResponseTimeMs +=
              aiTrace.durationMs as number;

            // For streaming, log that AI call was captured (raw SSE data will be added after streaming completes)
            logger.info(
              {
                requestId,
                userId,
                aiCallIndex: aiTrace.callIndex,
                aiCallTimestamp: aiTrace.timestamp,
                aiCallDurationMs: aiTrace.durationMs,
                requestBodyFull: aiTrace.requestBody,
                responseBodyType: "streaming",
                usage: aiTrace.usage,
                estimatedInputTokens: aiTrace.estimatedInputTokens,
              },
              "🔍 TRACE: AI streaming request captured (raw SSE data will be added after completion)",
            );
          }
        };

        // Function to capture tool call traces
        const captureToolTrace = (toolTrace: TraceToolCall) => {
          if (traceData) {
            traceData.toolCalls.push(toolTrace);
            traceData.summary.totalToolCalls++;
            traceData.summary.totalToolExecutionTimeMs += toolTrace.durationMs;
          }
        };

        // Function to add tool call to separate UI tracking (always enabled)
        const addToolCallSummary = (toolTrace: TraceToolCall) => {
          // Create a human-readable summary of the result
          let resultSummary: string | undefined;
          if (toolTrace.error) {
            resultSummary = `Error: ${toolTrace.error}`;
          } else if (toolTrace.result) {
            // Create a brief summary based on the result type
            if (Array.isArray(toolTrace.result)) {
              resultSummary = `Found ${toolTrace.result.length} items`;
            } else if (
              typeof toolTrace.result === "object" &&
              toolTrace.result !== null
            ) {
              // For object results, provide a generic summary
              const keys = Object.keys(toolTrace.result);
              if (keys.length > 0) {
                resultSummary = `Retrieved data with ${keys.length} field${keys.length === 1 ? "" : "s"}`;
              } else {
                resultSummary = "Operation completed successfully";
              }
            } else if (typeof toolTrace.result === "string") {
              // Truncate long string results
              resultSummary =
                toolTrace.result.length > 100
                  ? toolTrace.result.substring(0, 100) + "..."
                  : toolTrace.result;
            } else {
              resultSummary = "Operation completed successfully";
            }
          } else {
            resultSummary = "Operation completed";
          }

          const summary: ToolCallSummary = {
            functionName: toolTrace.functionName,
            executionTimeMs: toolTrace.durationMs,
            success: !toolTrace.error,
            error: toolTrace.error,
            arguments: toolTrace.arguments,
            resultSummary,
          };

          toolCallSummaries.push(summary);
        };

        // Get user context for personalizing the prompt
        const userContext = await getUserContextForPrompt(userId);
        logger.debug(
          { requestId, userId },
          "User context for streaming prompt loaded",
        );

        // Fetch asset contents if provided in context
        const assetContents: Array<{
          type: string;
          id: string;
          content: string;
        }> = [];
        if (context?.assets && context.assets.length > 0) {
          logger.info(
            { requestId, userId, assetCount: context.assets.length },
            "Fetching content for provided assets in streaming",
          );

          for (const assetRef of context.assets) {
            try {
              const content = await fetchAssetContent(assetRef, userId);
              assetContents.push({
                type: assetRef.type,
                id: assetRef.id,
                content: content || `[${assetRef.type} content not available]`,
              });
            } catch (assetError) {
              logger.warn(
                {
                  requestId,
                  userId,
                  assetType: assetRef.type,
                  assetId: assetRef.id,
                  error:
                    assetError instanceof Error
                      ? assetError.message
                      : "Unknown error",
                },
                "Failed to fetch asset content for streaming, skipping",
              );
              assetContents.push({
                type: assetRef.type,
                id: assetRef.id,
                content: `[Error retrieving ${assetRef.type} content]`,
              });
            }
          }
        }

        // Determine if we should include tool instructions
        const hasAssets = assetContents.length > 0;
        const isBackgroundTaskExecution =
          context?.backgroundTaskExecution === true;
        const includeToolInstructions = !hasAssets || isBackgroundTaskExecution;

        const systemPrompt = buildSystemPrompt(
          userContext,
          assetContents,
          includeToolInstructions,
          isBackgroundTaskExecution,
        );

        // Build messages array - handle conversation context
        const messages: AIMessage[] = [];

        if (conversation) {
          // For conversations, build from conversation history
          const conversationMessages = await buildAIMessageArray(
            conversation.id,
            true, // Include system prompt
            systemPrompt,
          );
          messages.push(...conversationMessages);
          messages.push({ role: "user", content: prompt });
        } else {
          // For single requests, use the original approach
          messages.push({ role: "system", content: systemPrompt });
          messages.push({ role: "user", content: prompt });
        }

        // Start streaming AI response
        const maxIterations = hasAssets ? 1 : 10;
        let currentIteration = 0;
        const totalTokens = 0;

        // Initialize streaming parser outside the loop for scope access
        const streamParser = new LLMStreamParser();

        // Initialize raw SSE buffer for current streaming session
        let rawSSEBuffer = "";

        while (currentIteration < maxIterations) {
          currentIteration++;
          logger.info(
            { requestId, userId, currentIteration, maxIterations },
            "Starting streaming AI iteration",
          );

          try {
            const aiOptions = {
              temperature: 0.1,
              maxTokens: 2000,
              stream: true,
              timeout: 180000,
              enableThinking,
              trace: traceData
                ? {
                    enabled: true,
                    callIndex: aiCallIndex++,
                    onTraceCapture: captureAITrace,
                  }
                : undefined,
            };

            const streamResponse = await callAIStream(
              messages,
              "backend",
              aiOptions,
            );

            // Create capture function to accumulate raw SSE data for this AI call
            const sseBufferCapture = (chunk: string) => {
              rawSSEBuffer += chunk;
            };

            // Use the streaming parser for unified SSE and content processing
            const parsedStream = await streamParser.processSSEStream(
              streamResponse.stream,
              traceData ? sseBufferCapture : undefined,
            );
            const reader = parsedStream.getReader();
            let fullContent = "";
            const streamedToolCalls: ToolCall[] = [];

            logger.debug(
              { requestId, userId, currentIteration },
              "🔄 Initialized fullContent for streaming accumulation",
            );

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const timestamp = new Date().toISOString();

                switch (value.type) {
                  case "reasoning":
                    if (value.content) {
                      logger.debug(
                        {
                          requestId,
                          userId,
                          currentIteration,
                          reasoningChunk: value.content,
                        },
                        "🧠 Received reasoning chunk from AI provider",
                      );
                      controller.enqueue({
                        type: "thought",
                        content: value.content,
                        timestamp,
                      });
                    }
                    break;

                  case "think_start":
                    logger.debug(
                      { requestId, userId, currentIteration },
                      "🧠 Started thinking section (embedded)",
                    );
                    break;

                  case "think_content":
                    if (value.content) {
                      logger.debug(
                        { requestId, userId, thinkingContent: value.content },
                        "🧠 Streaming thinking content (embedded)",
                      );
                      controller.enqueue({
                        type: "thought",
                        content: value.content,
                        timestamp,
                      });
                    }
                    break;

                  case "think_end":
                    logger.debug(
                      { requestId, userId, currentIteration },
                      "🧠 Ended thinking section (embedded)",
                    );
                    break;

                  case "content":
                    if (value.content) {
                      fullContent += value.content;
                      logger.debug(
                        {
                          requestId,
                          userId,
                          textContent: value.content,
                          fullContentLength: fullContent.length,
                        },
                        "📤 Streaming text content",
                      );
                      controller.enqueue({
                        type: "text-chunk",
                        content: value.content,
                        timestamp,
                      });
                    }
                    break;

                  case "tool_call":
                    if (value.data && value.data.calls) {
                      logger.debug(
                        { requestId, userId, toolCallData: value.data },
                        "🔧 Detected tool call in stream",
                      );
                      // Convert parser format to execution format and collect
                      for (const call of value.data.calls) {
                        if (call.name && call.args) {
                          streamedToolCalls.push({
                            functionName: call.name,
                            arguments: call.args,
                          });
                        }
                      }
                    }
                    break;

                  case "done":
                    logger.info(
                      {
                        requestId,
                        userId,
                        currentIteration,
                        fullContentLength: fullContent.length,
                        fullContentFirstChar:
                          fullContent.length > 0 ? fullContent[0] : "EMPTY",
                        fullContentPreview: fullContent.substring(0, 200),
                        fullContentStart20: fullContent.substring(0, 20),
                      },
                      "Completed streaming AI iteration - processing full content",
                    );
                    break;
                }
              }
            } finally {
              reader.releaseLock();
            }

            logger.debug(
              {
                requestId,
                userId,
                currentIteration,
                finalFullContent: fullContent,
                finalFullContentLength: fullContent.length,
                finalFullContentFirstChar:
                  fullContent.length > 0 ? fullContent[0] : "EMPTY",
                finalFullContentPreview: fullContent.substring(0, 100),
              },
              "📝 Adding assistant message with accumulated fullContent",
            );

            messages.push({ role: "assistant", content: fullContent });

            let toolCalls: ToolCall[] = [];
            let isFinalResponseJson = false;

            // For simple prompts with assets, skip tool call parsing
            if (hasAssets) {
              logger.info(
                { requestId, userId, currentIteration },
                "Using simple prompt with assets - treating response as final text",
              );
              break;
            }

            try {
              // Use streamed tool calls if available, otherwise parse the complete content
              let parseResult: TextToolParseResult;
              if (streamedToolCalls.length > 0) {
                // Use tool calls collected during streaming
                const thinkingResult = streamParser.getFinalThinkingContent();
                parseResult = {
                  hasToolCalls: true,
                  toolCalls: streamedToolCalls,
                  textResponse: fullContent.trim() || undefined,
                  thinkingContent: thinkingResult.thinkingContent || undefined,
                  thinkingSource: thinkingResult.thinkingSource,
                };
              } else {
                // Fallback to text parser for non-streaming case
                // Get thinking content from stream parser (which handles reasoning precedence)
                const thinkingResult = streamParser.getFinalThinkingContent();
                parseResult = parseTextToolContent(fullContent);
                // Override thinking content with stream parser result (which includes reasoning)
                if (thinkingResult.thinkingContent) {
                  parseResult.thinkingContent = thinkingResult.thinkingContent;
                  parseResult.thinkingSource = thinkingResult.thinkingSource;
                }
              }

              logger.debug(
                {
                  requestId,
                  userId,
                  currentIteration,
                  hasThinking: !!parseResult.thinkingContent,
                  hasTextResponse: !!parseResult.textResponse,
                  hasToolCalls: !!parseResult.toolCalls?.length,
                  toolCallsCount: parseResult.toolCalls?.length || 0,
                },
                "Parsed complete streaming content with text parser",
              );

              // Extract tool calls using the proper parser
              const extractedToolCalls = extractToolCalls(parseResult);
              if (extractedToolCalls.length > 0) {
                logger.info(
                  {
                    requestId,
                    userId,
                    currentIteration,
                    toolCallsCount: extractedToolCalls.length,
                  },
                  "Detected tool calls from streaming parser",
                );
                toolCalls = extractedToolCalls.map((tc) => ({
                  functionName: tc.functionName,
                  arguments: tc.arguments,
                }));
              }

              // Check for final response
              const finalResponse = extractFinalResponse(parseResult);
              if (finalResponse) {
                logger.debug(
                  { requestId, userId, currentIteration },
                  "Detected final response from streaming parser",
                );
                isFinalResponseJson = true;
              }

              // Exit conditions
              if (isFinalResponseJson || toolCalls.length === 0) {
                break;
              }
            } catch (error) {
              logger.warn(
                {
                  requestId,
                  userId,
                  currentIteration,
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                },
                "Error parsing streaming assistant content with text parser, treating as plain text",
              );
              toolCalls = [];
              break;
            }

            if (toolCalls.length === 0) {
              break;
            }

            // Process tool calls
            const toolResults = [];
            for (const toolCall of toolCalls) {
              // Stream tool call start event
              controller.enqueue({
                type: "tool-call",
                name: toolCall.functionName,
                status: "starting",
                arguments: toolCall.arguments,
                timestamp: new Date().toISOString(),
              });

              const toolStartTime = Date.now();
              try {
                // Stream executing status
                controller.enqueue({
                  type: "tool-call",
                  name: toolCall.functionName,
                  status: "executing",
                  arguments: toolCall.arguments,
                  timestamp: new Date().toISOString(),
                });

                const result = await executeToolCall(toolCall, userId);
                const toolEndTime = Date.now();
                const toolDurationMs = toolEndTime - toolStartTime;

                // Stream completion status
                controller.enqueue({
                  type: "tool-call",
                  name: toolCall.functionName,
                  status: "completed",
                  result: result,
                  timestamp: new Date().toISOString(),
                });

                toolResults.push({
                  tool_name: toolCall.functionName,
                  result: result,
                });

                // Capture tool trace
                const streamingToolTraceData = {
                  callIndex: toolCallIndex++,
                  timestamp: new Date(toolStartTime).toISOString(),
                  functionName: toolCall.functionName,
                  arguments: deepCopyForTrace(toolCall.arguments),
                  result: deepCopyForTrace(result),
                  durationMs: toolDurationMs,
                };
                captureToolTrace(streamingToolTraceData);
                addToolCallSummary(streamingToolTraceData);
              } catch (error) {
                const toolEndTime = Date.now();
                const toolDurationMs = toolEndTime - toolStartTime;

                // Stream error status
                controller.enqueue({
                  type: "tool-call",
                  name: toolCall.functionName,
                  status: "error",
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                  timestamp: new Date().toISOString(),
                });

                const errorMessage =
                  error instanceof Error ? error.message : "Unknown error";
                toolResults.push({
                  tool_name: toolCall.functionName,
                  error: errorMessage,
                  result: null,
                });

                // Capture tool error trace
                const streamingToolErrorTraceData = {
                  callIndex: toolCallIndex++,
                  timestamp: new Date(toolStartTime).toISOString(),
                  functionName: toolCall.functionName,
                  arguments: deepCopyForTrace(toolCall.arguments),
                  result: null,
                  error: errorMessage,
                  durationMs: toolDurationMs,
                };
                captureToolTrace(streamingToolErrorTraceData);
                addToolCallSummary(streamingToolErrorTraceData);
              }
            }

            // Add tool results to messages for next iteration
            const toolResultsMessageContent = `Tool results: ${JSON.stringify(toolResults, null, 2)}`;
            messages.push({ role: "user", content: toolResultsMessageContent });
          } catch (aiError) {
            logger.error(
              {
                requestId,
                userId,
                currentIteration,
                error:
                  aiError instanceof Error ? aiError.message : "Unknown error",
                stack: aiError instanceof Error ? aiError.stack : undefined,
              },
              "Error in streaming AI iteration",
            );

            controller.enqueue({
              type: "error",
              error:
                aiError instanceof Error ? aiError.message : "Unknown error",
              timestamp: new Date().toISOString(),
            });
            controller.close();
            return;
          }
        }

        // Update AI call trace with captured raw SSE buffer (after streaming completes)
        if (traceData && rawSSEBuffer && traceData.aiCalls.length > 0) {
          // Find the most recent AI call (should be the streaming call we just processed)
          const lastAiCall = traceData.aiCalls[traceData.aiCalls.length - 1];
          if (lastAiCall && lastAiCall.responseBody) {
            lastAiCall.responseBody.rawSSEResponse = rawSSEBuffer;

            logger.info(
              {
                requestId,
                userId,
                aiCallIndex: lastAiCall.callIndex,
                rawSSEBufferSize: rawSSEBuffer.length,
                rawSSEBufferPreview:
                  rawSSEBuffer.substring(0, 100) +
                  (rawSSEBuffer.length > 100 ? "..." : ""),
              },
              "📝 Updated AI call trace with complete raw SSE buffer",
            );
          }
        }

        // Save messages to conversation if needed
        let finalConversationId = conversationId;
        let finalThinkingContent: string | null = null;

        // Get and validate the final assistant message
        const finalAssistantMessage = messages
          .filter((m) => m.role === "assistant")
          .pop();

        // Validate final assistant message structure
        if (finalAssistantMessage) {
          if (
            !finalAssistantMessage.content ||
            typeof finalAssistantMessage.content !== "string"
          ) {
            logger.error(
              {
                requestId,
                userId,
                messageContent: finalAssistantMessage.content,
                contentType: typeof finalAssistantMessage.content,
              },
              "Invalid final assistant message content in streaming response",
            );

            controller.enqueue({
              type: "error",
              error: "Invalid AI response structure",
              timestamp: new Date().toISOString(),
            });
            controller.close();
            return;
          }

          // Additional check: ensure response doesn't look like serialized JSON
          // Use parser to properly extract text content without thinking tags
          const validationParseResult = parseTextToolContent(
            finalAssistantMessage.content,
          );
          const cleanedContent = validationParseResult.textResponse || "";
          if (
            cleanedContent.trim().startsWith("{") &&
            cleanedContent.trim().endsWith("}")
          ) {
            logger.warn(
              {
                requestId,
                userId,
                responsePreview: cleanedContent.substring(0, 300),
                responseLength: cleanedContent.length,
              },
              "Warning: Streaming response appears to contain JSON string instead of plain text",
            );
          }

          logger.info(
            {
              requestId,
              userId,
              responseLength: finalAssistantMessage.content.length,
              responsePreview:
                finalAssistantMessage.content.substring(0, 200) +
                (finalAssistantMessage.content.length > 200 ? "..." : ""),
            },
            "Final streaming assistant message validated successfully",
          );
        }

        if (conversation) {
          // Add user message to conversation
          await createMessage({
            conversationId: conversation.id,
            role: "user",
            content: prompt,
            metadata: { requestId, trace: traceData ? true : false },
          });

          // Add final assistant response to conversation
          if (finalAssistantMessage) {
            // Get thinking content from stream parser (which handles reasoning precedence)
            const thinkingResult = streamParser.getFinalThinkingContent();
            finalThinkingContent = thinkingResult.thinkingContent || null; // Capture for final done event
            await createMessage({
              conversationId: conversation.id,
              role: "assistant",
              content: finalAssistantMessage.content,
              thinkingContent: thinkingResult.thinkingContent || undefined,
              toolCalls:
                toolCallSummaries.length > 0 ? toolCallSummaries : undefined,
              metadata: {
                requestId,
                trace: traceData ? true : false,
                tokenUsage: traceData?.summary || undefined,
              },
            });
          }

          await updateConversationActivity(conversation.id, userId);
        } else if (!hasAssets) {
          // Create new conversation for non-asset requests
          const title = generateConversationTitle(prompt);
          const newConversation = await createConversation({
            userId,
            title,
          });

          finalConversationId = newConversation.id;
          isNewConversation = true;

          // Add messages to new conversation
          await createMessage({
            conversationId: newConversation.id,
            role: "user",
            content: prompt,
            metadata: { requestId, trace: traceData ? true : false },
          });

          if (finalAssistantMessage) {
            // Get thinking content from stream parser (which handles reasoning precedence)
            const thinkingResult = streamParser.getFinalThinkingContent();
            finalThinkingContent = thinkingResult.thinkingContent || null; // Capture for final done event
            await createMessage({
              conversationId: newConversation.id,
              role: "assistant",
              content: finalAssistantMessage.content,
              thinkingContent: thinkingResult.thinkingContent || undefined,
              toolCalls:
                toolCallSummaries.length > 0 ? toolCallSummaries : undefined,
              metadata: {
                requestId,
                trace: traceData ? true : false,
                tokenUsage: traceData?.summary || undefined,
              },
            });
          }

          await updateConversationActivity(newConversation.id, userId);
        }

        // Calculate final trace summary
        const endTime = Date.now();
        if (traceData) {
          traceData.summary.totalExecutionTimeMs = endTime - startTime;
        }

        // Log the streaming interaction if logging is enabled and we have trace data
        if (
          aiPromptLogger.isLoggingEnabled() &&
          traceData &&
          finalAssistantMessage
        ) {
          try {
            const finalRequestId = requestId || `req_stream_${Date.now()}`;

            await aiPromptLogger.logInteraction(
              finalRequestId,
              userId,
              prompt,
              context,
              traceData,
              {
                type: "text_response",
                response: finalAssistantMessage.content,
                thinkingContent: finalThinkingContent,
                toolCalls:
                  toolCallSummaries.length > 0 ? toolCallSummaries : undefined,
              },
              {
                conversationId: finalConversationId,
                isStreaming: true,
                hasAssets:
                  (context?.assets && context.assets.length > 0) || false,
                assetCount: context?.assets?.length || 0,
                enableThinking,
                startTime,
                endTime,
              },
            );
          } catch (logError) {
            // Don't fail the stream if logging fails, just log the error
            logger.warn(
              {
                requestId,
                userId,
                logError:
                  logError instanceof Error
                    ? logError.message
                    : "Unknown streaming logging error",
              },
              "Failed to log streaming AI prompt interaction, continuing with response",
            );
          }
        }

        // Send final done event with complete information
        controller.enqueue({
          type: "done",
          requestId: requestId || `req_stream_${Date.now()}`,
          conversationId: finalConversationId,
          totalTokens,
          executionTimeMs: endTime - startTime,
          responseType: "text_response", // For future extensibility (image_response, file_response, etc.)
          timestamp: new Date().toISOString(),
          ...(finalThinkingContent && {
            thinkingContent: finalThinkingContent,
          }),
          ...(toolCallSummaries.length > 0 && { toolCalls: toolCallSummaries }),
        });

        controller.close();

        logger.info(
          {
            requestId,
            userId,
            conversationId: finalConversationId,
            isNewConversation,
            totalExecutionTimeMs: endTime - startTime,
            traceEnabled: trace,
            totalAiCalls: traceData?.summary.totalAiCalls || 0,
            totalToolCalls: traceData?.summary.totalToolCalls || 0,
          },
          "Streaming prompt request processing completed",
        );
      } catch (error) {
        logger.error(
          {
            requestId,
            userId,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          },
          "Error in streaming prompt request",
        );

        controller.enqueue({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        });
        controller.close();
      }
    },
  });
}
