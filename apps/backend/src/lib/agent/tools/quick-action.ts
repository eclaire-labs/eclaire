/**
 * Quick Action Tool
 *
 * Flag, pin, or set review status on any content type.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { updateBookmark } from "../../services/bookmarks.js";
import { updateDocument } from "../../services/documents.js";
import { updateNoteEntry } from "../../services/notes.js";
import { updatePhotoMetadata } from "../../services/photos.js";
import { updateTask } from "../../services/tasks.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  action: z
    .enum(["flag", "pin", "review"])
    .describe("The quick action to perform"),
  contentType: z
    .enum(["bookmarks", "notes", "tasks", "documents", "photos"])
    .describe("The type of content to act on"),
  id: z.string().describe("ID of the item"),
  value: z
    .union([
      z.enum(["red", "yellow", "orange", "green", "blue"]),
      z.boolean(),
      z.enum(["pending", "accepted", "rejected"]),
      z.null(),
    ])
    .describe(
      "Value to set. For flag: color name or null to clear. For pin: true/false. For review: status string.",
    ),
});

type UpdateFn = (
  id: string,
  // biome-ignore lint/suspicious/noExplicitAny: varies by content type
  data: any,
  // biome-ignore lint/suspicious/noExplicitAny: CallerContext
  caller: any,
) => Promise<unknown>;

const updateFns: Record<string, UpdateFn> = {
  bookmarks: updateBookmark,
  notes: updateNoteEntry,
  tasks: updateTask,
  documents: updateDocument,
  photos: updatePhotoMetadata,
};

export const quickActionTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "quickAction",
  label: "Quick Action",
  description:
    "Flag, pin, or set review status on any content item (bookmark, note, task, document, or photo).",
  inputSchema,
  promptGuidelines: [
    "Always confirm with the user before changing flags, pins, or review status.",
  ],
  execute: async (_callId, input, ctx) => {
    const updateFn = updateFns[input.contentType];
    if (!updateFn) {
      return errorResult(`Unknown content type: ${input.contentType}`);
    }

    const updateData: Record<string, unknown> = {};
    switch (input.action) {
      case "flag":
        updateData.flagColor = input.value;
        break;
      case "pin":
        updateData.isPinned = input.value;
        break;
      case "review":
        updateData.reviewStatus = input.value;
        break;
    }

    try {
      const result = await updateFn(input.id, updateData, agentToolCaller(ctx));
      return textResult(JSON.stringify(result, null, 2));
    } catch {
      return errorResult(
        `Failed to ${input.action} ${input.contentType} item. It may not exist.`,
      );
    }
  },
};
