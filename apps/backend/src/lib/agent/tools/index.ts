/**
 * Backend Agent Tools
 *
 * All available tools for the RuntimeAgent.
 * Static tools are defined here; MCP-sourced tools are merged in via getBackendTools().
 */

import type { RuntimeToolDefinition } from "@eclaire/ai";
import { getMcpRegistry } from "../../mcp/index.js";
import { isAudioAvailable } from "../../services/audio.js";
// Count tools
import { countBookmarksTool } from "./count-bookmarks.js";
import { countDocumentsTool } from "./count-documents.js";
import { countMediaTool } from "./count-media.js";
import { countNotesTool } from "./count-notes.js";
import { countPhotosTool } from "./count-photos.js";
import { countTasksTool } from "./count-tasks.js";
// Create tools
import { createBookmarkTool } from "./create-bookmark.js";
import { createNoteTool } from "./create-note.js";
import { createTaskTool } from "./create-task.js";
// Delete tools
import { deleteBookmarkTool } from "./delete-bookmark.js";
import { deleteDocumentTool } from "./delete-document.js";
import { deleteMediaTool } from "./delete-media.js";
import { deleteNoteTool } from "./delete-note.js";
import { deletePhotoTool } from "./delete-photo.js";
import { deleteTaskTool } from "./delete-task.js";
// Find tools
import { findBookmarksTool } from "./find-bookmarks.js";
import { findDocumentsTool } from "./find-documents.js";
import { findMediaTool } from "./find-media.js";
import { findNotesTool } from "./find-notes.js";
import { findPhotosTool } from "./find-photos.js";
import { findTasksTool } from "./find-tasks.js";
// Get tools
import { getBookmarkTool } from "./get-bookmark.js";
import { getDocumentTool } from "./get-document.js";
import { getDueItemsTool } from "./get-due-items.js";
import { getHistoryTool } from "./get-history.js";
import { getMediaTool } from "./get-media.js";
import { getMediaInfoTool } from "./get-media-info.js";
import { getNoteTool } from "./get-note.js";
import { getPhotoTool } from "./get-photo.js";
import { getTaskTool } from "./get-task.js";
import { getTaskCommentsTool } from "./get-task-comments.js";
// Skill tools
import { loadSkillTool } from "./load-skill.js";
// Quick action tools
import { quickActionTool } from "./quick-action.js";
// Search tools
import { searchAllTool } from "./search-all.js";
// Notification tools
import { sendNotificationTool } from "./send-notification.js";
// Scheduling tools
import { cancelScheduledActionTool } from "./cancel-scheduled-action.js";
import { listScheduledActionsTool } from "./list-scheduled-actions.js";
import { scheduleActionTool } from "./schedule-action.js";
// Task comment tools
import { addTaskCommentTool } from "./add-task-comment.js";
import { browseChromeTool } from "./browse-chrome.js";
import { browseWebTool } from "./browse-web.js";
// Audio tools
import { synthesizeSpeechTool } from "./synthesize-speech.js";
import { transcribeAudioTool } from "./transcribe-audio.js";
// Tag tools
import { listTagsTool } from "./list-tags.js";
// Media tools
import { importMediaUrlTool } from "./import-media-url.js";
// Update tools
import { updateBookmarkTool } from "./update-bookmark.js";
import { updateDocumentTool } from "./update-document.js";
import { updateMediaTool } from "./update-media.js";
import { updateNoteTool } from "./update-note.js";
import { updatePhotoTool } from "./update-photo.js";
import { updateTaskTool } from "./update-task.js";
// User settings tools
import { getUserSettingsTool } from "./get-user-settings.js";
import { updateUserSettingsTool } from "./update-user-settings.js";
// Processing status tools
import { getProcessingStatusTool } from "./get-processing-status.js";
// Admin tools
import { manageAdminReadTool } from "./manage-admin-read.js";
import { manageAdminWriteTool } from "./manage-admin-write.js";

/**
 * Static backend tools (always available).
 */
const staticTools: Record<string, RuntimeToolDefinition> = {
  // Find tools
  findNotes: findNotesTool,
  findBookmarks: findBookmarksTool,
  findDocuments: findDocumentsTool,
  findMedia: findMediaTool,
  findPhotos: findPhotosTool,
  findTasks: findTasksTool,
  // Search tools
  searchAll: searchAllTool,
  browseWeb: browseWebTool,
  browseChrome: browseChromeTool,
  // Count tools
  countNotes: countNotesTool,
  countBookmarks: countBookmarksTool,
  countDocuments: countDocumentsTool,
  countMedia: countMediaTool,
  countPhotos: countPhotosTool,
  countTasks: countTasksTool,
  // Get tools
  getTask: getTaskTool,
  getNote: getNoteTool,
  getBookmark: getBookmarkTool,
  getDocument: getDocumentTool,
  getMedia: getMediaTool,
  getPhoto: getPhotoTool,
  getTaskComments: getTaskCommentsTool,
  getDueItems: getDueItemsTool,
  getHistory: getHistoryTool,
  // Create tools
  createNote: createNoteTool,
  createTask: createTaskTool,
  createBookmark: createBookmarkTool,
  // Update tools
  updateTask: updateTaskTool,
  updateNote: updateNoteTool,
  updateBookmark: updateBookmarkTool,
  updateDocument: updateDocumentTool,
  updateMedia: updateMediaTool,
  updatePhoto: updatePhotoTool,
  // Delete tools
  deleteBookmark: deleteBookmarkTool,
  deleteNote: deleteNoteTool,
  deleteTask: deleteTaskTool,
  deleteDocument: deleteDocumentTool,
  deleteMedia: deleteMediaTool,
  deletePhoto: deletePhotoTool,
  // Media tools
  importMediaUrl: importMediaUrlTool,
  getMediaInfo: getMediaInfoTool,
  // Quick action tools
  quickAction: quickActionTool,
  // Notification tools
  sendNotification: sendNotificationTool,
  // Scheduling tools
  scheduleAction: scheduleActionTool,
  listScheduledActions: listScheduledActionsTool,
  cancelScheduledAction: cancelScheduledActionTool,
  // Task comment tools
  addTaskComment: addTaskCommentTool,
  // Tag tools
  listTags: listTagsTool,
  // Skill tools
  loadSkill: loadSkillTool,
  // User settings tools
  getUserSettings: getUserSettingsTool,
  updateUserSettings: updateUserSettingsTool,
  // Processing status tools
  getProcessingStatus: getProcessingStatusTool,
  // Admin tools (filtered by user role and scopes in selectAgentTools)
  manageAdminRead: manageAdminReadTool,
  manageAdminWrite: manageAdminWriteTool,
};

/**
 * All backend tools: static tools merged with dynamic MCP-sourced tools.
 * Use this instead of `staticTools` when you need the full tool set.
 */
export function getBackendTools(): Record<string, RuntimeToolDefinition> {
  const tools: Record<string, RuntimeToolDefinition> = { ...staticTools };

  // Merge MCP-sourced tools
  try {
    const mcpTools = getMcpRegistry().getMcpTools();
    Object.assign(tools, mcpTools);
  } catch {
    // Registry not yet initialized (e.g. during import-time access)
  }

  // Merge audio tools if audio service is available
  if (isAudioAvailable()) {
    tools.transcribeAudio = transcribeAudioTool;
    tools.synthesizeSpeech = synthesizeSpeechTool;
  }

  return tools;
}

/**
 * @deprecated Use getBackendTools() instead. Kept for backward compatibility
 * during migration — only includes static tools, not MCP-sourced tools.
 */
export const backendTools: Record<string, RuntimeToolDefinition> = staticTools;

// Re-export individual tools for direct imports
export { addTaskCommentTool } from "./add-task-comment.js";
export { browseChromeTool } from "./browse-chrome.js";
export { browseWebTool } from "./browse-web.js";
export { countBookmarksTool } from "./count-bookmarks.js";
export { countDocumentsTool } from "./count-documents.js";
export { countMediaTool } from "./count-media.js";
export { countNotesTool } from "./count-notes.js";
export { countPhotosTool } from "./count-photos.js";
export { countTasksTool } from "./count-tasks.js";
export { createBookmarkTool } from "./create-bookmark.js";
export { createNoteTool } from "./create-note.js";
export { createTaskTool } from "./create-task.js";
export { deleteBookmarkTool } from "./delete-bookmark.js";
export { deleteDocumentTool } from "./delete-document.js";
export { deleteMediaTool } from "./delete-media.js";
export { deleteNoteTool } from "./delete-note.js";
export { deletePhotoTool } from "./delete-photo.js";
export { deleteTaskTool } from "./delete-task.js";
export { findBookmarksTool } from "./find-bookmarks.js";
export { findDocumentsTool } from "./find-documents.js";
export { findMediaTool } from "./find-media.js";
export { findNotesTool } from "./find-notes.js";
export { findPhotosTool } from "./find-photos.js";
export { findTasksTool } from "./find-tasks.js";
export { getBookmarkTool } from "./get-bookmark.js";
export { getDocumentTool } from "./get-document.js";
export { getDueItemsTool } from "./get-due-items.js";
export { getMediaTool } from "./get-media.js";
export { getMediaInfoTool } from "./get-media-info.js";
export { getHistoryTool } from "./get-history.js";
export { getNoteTool } from "./get-note.js";
export { getPhotoTool } from "./get-photo.js";
export { getTaskTool } from "./get-task.js";
export { getTaskCommentsTool } from "./get-task-comments.js";
export { listTagsTool } from "./list-tags.js";
export { loadSkillTool } from "./load-skill.js";
export { quickActionTool } from "./quick-action.js";
export { searchAllTool } from "./search-all.js";
export { cancelScheduledActionTool } from "./cancel-scheduled-action.js";
export { listScheduledActionsTool } from "./list-scheduled-actions.js";
export { scheduleActionTool } from "./schedule-action.js";
export { sendNotificationTool } from "./send-notification.js";
export { importMediaUrlTool } from "./import-media-url.js";
export { updateBookmarkTool } from "./update-bookmark.js";
export { updateDocumentTool } from "./update-document.js";
export { updateMediaTool } from "./update-media.js";
export { updateNoteTool } from "./update-note.js";
export { updatePhotoTool } from "./update-photo.js";
export { updateTaskTool } from "./update-task.js";
// Audio tools
export { synthesizeSpeechTool } from "./synthesize-speech.js";
export { transcribeAudioTool } from "./transcribe-audio.js";
// User settings tools
export { getUserSettingsTool } from "./get-user-settings.js";
export { updateUserSettingsTool } from "./update-user-settings.js";
// Processing status tools
export { getProcessingStatusTool } from "./get-processing-status.js";
// Admin tools
export { manageAdminReadTool } from "./manage-admin-read.js";
export { manageAdminWriteTool } from "./manage-admin-write.js";
