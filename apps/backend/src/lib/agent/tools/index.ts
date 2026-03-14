/**
 * Backend Agent Tools
 *
 * All available tools for the RuntimeAgent.
 */

import type { RuntimeToolDefinition } from "@eclaire/ai";
// Count tools
import { countBookmarksTool } from "./count-bookmarks.js";
import { countDocumentsTool } from "./count-documents.js";
import { countNotesTool } from "./count-notes.js";
import { countPhotosTool } from "./count-photos.js";
import { countTasksTool } from "./count-tasks.js";
// Create tools
import { createBookmarkTool } from "./create-bookmark.js";
import { createNoteTool } from "./create-note.js";
import { createTaskTool } from "./create-task.js";
// Find tools
import { findBookmarksTool } from "./find-bookmarks.js";
import { findDocumentsTool } from "./find-documents.js";
import { findNotesTool } from "./find-notes.js";
import { findPhotosTool } from "./find-photos.js";
import { findTasksTool } from "./find-tasks.js";
// Get tools
import { getBookmarkTool } from "./get-bookmark.js";
import { getDueItemsTool } from "./get-due-items.js";
import { getNoteTool } from "./get-note.js";
import { getTaskTool } from "./get-task.js";
import { getTaskCommentsTool } from "./get-task-comments.js";
// Skill tools
import { loadSkillTool } from "./load-skill.js";
// Search tools
import { searchAllTool } from "./search-all.js";
// Task comment tools
import { addTaskCommentTool } from "./add-task-comment.js";
import { browseWebTool } from "./browse-web.js";
// Tag tools
import { listTagsTool } from "./list-tags.js";
// Update tools
import { updateBookmarkTool } from "./update-bookmark.js";
import { updateNoteTool } from "./update-note.js";
import { updateTaskTool } from "./update-task.js";

/**
 * All backend tools as a record for RuntimeAgent.
 */
export const backendTools: Record<string, RuntimeToolDefinition> = {
  // Find tools
  findNotes: findNotesTool,
  findBookmarks: findBookmarksTool,
  findDocuments: findDocumentsTool,
  findPhotos: findPhotosTool,
  findTasks: findTasksTool,
  // Search tools
  searchAll: searchAllTool,
  browseWeb: browseWebTool,
  // Count tools
  countNotes: countNotesTool,
  countBookmarks: countBookmarksTool,
  countDocuments: countDocumentsTool,
  countPhotos: countPhotosTool,
  countTasks: countTasksTool,
  // Get tools
  getTask: getTaskTool,
  getNote: getNoteTool,
  getBookmark: getBookmarkTool,
  getTaskComments: getTaskCommentsTool,
  getDueItems: getDueItemsTool,
  // Create tools
  createNote: createNoteTool,
  createTask: createTaskTool,
  createBookmark: createBookmarkTool,
  // Update tools
  updateTask: updateTaskTool,
  updateNote: updateNoteTool,
  updateBookmark: updateBookmarkTool,
  // Task comment tools
  addTaskComment: addTaskCommentTool,
  // Tag tools
  listTags: listTagsTool,
  // Skill tools
  loadSkill: loadSkillTool,
};

// Re-export individual tools for direct imports
export { addTaskCommentTool } from "./add-task-comment.js";
export { browseWebTool } from "./browse-web.js";
export { countBookmarksTool } from "./count-bookmarks.js";
export { countDocumentsTool } from "./count-documents.js";
export { countNotesTool } from "./count-notes.js";
export { countPhotosTool } from "./count-photos.js";
export { countTasksTool } from "./count-tasks.js";
export { createBookmarkTool } from "./create-bookmark.js";
export { createNoteTool } from "./create-note.js";
export { createTaskTool } from "./create-task.js";
export { findBookmarksTool } from "./find-bookmarks.js";
export { findDocumentsTool } from "./find-documents.js";
export { findNotesTool } from "./find-notes.js";
export { findPhotosTool } from "./find-photos.js";
export { findTasksTool } from "./find-tasks.js";
export { getBookmarkTool } from "./get-bookmark.js";
export { getDueItemsTool } from "./get-due-items.js";
export { getNoteTool } from "./get-note.js";
export { getTaskTool } from "./get-task.js";
export { getTaskCommentsTool } from "./get-task-comments.js";
export { listTagsTool } from "./list-tags.js";
export { loadSkillTool } from "./load-skill.js";
export { searchAllTool } from "./search-all.js";
export { updateBookmarkTool } from "./update-bookmark.js";
export { updateNoteTool } from "./update-note.js";
export { updateTaskTool } from "./update-task.js";
