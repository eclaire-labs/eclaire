/**
 * Backend Agent Tools
 *
 * All available tools for the backend ToolLoopAgent.
 */

import { countBookmarksTool } from "./count-bookmarks.js";
import { countDocumentsTool } from "./count-documents.js";
// Count tools
import { countNotesTool } from "./count-notes.js";
import { countPhotosTool } from "./count-photos.js";
import { countTasksTool } from "./count-tasks.js";
// Create tools
import { createNoteTool } from "./create-note.js";
import { findBookmarksTool } from "./find-bookmarks.js";
import { findDocumentsTool } from "./find-documents.js";
// Find tools
import { findNotesTool } from "./find-notes.js";
import { findPhotosTool } from "./find-photos.js";
import { findTasksTool } from "./find-tasks.js";

/**
 * All backend tools as a record for ToolLoopAgent.
 */
export const backendTools = {
  // Find tools
  findNotes: findNotesTool,
  findBookmarks: findBookmarksTool,
  findDocuments: findDocumentsTool,
  findPhotos: findPhotosTool,
  findTasks: findTasksTool,
  // Count tools
  countNotes: countNotesTool,
  countBookmarks: countBookmarksTool,
  countDocuments: countDocumentsTool,
  countPhotos: countPhotosTool,
  countTasks: countTasksTool,
  // Create tools
  createNote: createNoteTool,
};

export { countBookmarksTool } from "./count-bookmarks.js";
export { countDocumentsTool } from "./count-documents.js";
export { countNotesTool } from "./count-notes.js";
export { countPhotosTool } from "./count-photos.js";
export { countTasksTool } from "./count-tasks.js";
export { createNoteTool } from "./create-note.js";
export { findBookmarksTool } from "./find-bookmarks.js";
export { findDocumentsTool } from "./find-documents.js";
// Re-export individual tools for direct imports
export { findNotesTool } from "./find-notes.js";
export { findPhotosTool } from "./find-photos.js";
export { findTasksTool } from "./find-tasks.js";
