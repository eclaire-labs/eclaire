import { apiFetch } from "@/lib/frontend-api";
import type { Bookmark as BookmarkType } from "@/types/bookmark";
import type { ContentLink } from "@/types/message";

/**
 * Detect content links in text (e.g., /bookmarks/abc123)
 */
export const detectContentLinks = (text: string): ContentLink[] => {
  const links: ContentLink[] = [];
  const linkPattern =
    /(\/(?:bookmarks|documents|photos|tasks|notes)\/[a-zA-Z0-9_-]+)/g;
  const matches = text.match(linkPattern);

  if (matches) {
    matches.forEach((match) => {
      const [, type, id] = match.split("/");
      if (type && id) {
        links.push({
          type: type.slice(0, -1) as ContentLink["type"], // Remove 's' from plural
          id,
          url: match,
          title: `${type.slice(0, -1)} ${id}`,
        });
      }
    });
  }

  return links;
};

/**
 * Fetch metadata for a content link from existing asset endpoints
 * (Reused from main-layout-client.tsx)
 */
export const fetchContentMetadata = async (
  link: ContentLink,
): Promise<ContentLink> => {
  try {
    if (link.type === "bookmark") {
      const response = await apiFetch(`/api/bookmarks/${link.id}`);
      if (response.ok) {
        const bookmark: BookmarkType = await response.json();
        return {
          ...link,
          title: bookmark.title || "Untitled Bookmark",
          description: bookmark.description || "No description available",
          metadata: {
            originalUrl: bookmark.url,
            tags: bookmark.tags,
            status: bookmark.processingStatus,
            createdAt: bookmark.createdAt,
            author: bookmark.author,
            faviconStorageId: bookmark.faviconUrl,
            screenshotDesktopStorageId: bookmark.thumbnailUrl,
            reviewStatus: bookmark.reviewStatus,
            flagColor: bookmark.flagColor,
            isPinned: bookmark.isPinned,
          },
        };
      }
    } else if (link.type === "document") {
      const response = await apiFetch(`/api/documents/${link.id}`);
      if (response.ok) {
        const document = await response.json();
        return {
          ...link,
          title: document.title || "Untitled Document",
          description: document.description || "No description available",
          metadata: {
            originalFilename: document.originalFilename,
            mimeType: document.mimeType,
            fileSize: document.fileSize,
            fileUrl: document.fileUrl,
            thumbnailUrl: document.thumbnailUrl,
            screenshotUrl: document.screenshotUrl,
            pdfUrl: document.pdfUrl,
            contentUrl: document.contentUrl,
            tags: document.tags,
            status: document.processingStatus,
            createdAt: document.createdAt,
            reviewStatus: document.reviewStatus,
            flagColor: document.flagColor,
            isPinned: document.isPinned,
            dueDate: document.dueDate,
          },
        };
      }
    } else if (link.type === "photo") {
      const response = await apiFetch(`/api/photos/${link.id}`);
      if (response.ok) {
        const photo = await response.json();
        return {
          ...link,
          title: photo.title || "Untitled Photo",
          description: photo.description || "No description available",
          metadata: {
            originalFilename: photo.originalFilename,
            mimeType: photo.mimeType,
            fileSize: photo.fileSize,
            imageUrl: photo.imageUrl,
            thumbnailUrl: photo.thumbnailUrl,
            originalUrl: photo.originalUrl,
            convertedJpgUrl: photo.convertedJpgUrl,
            imageWidth: photo.imageWidth,
            imageHeight: photo.imageHeight,
            cameraMake: photo.cameraMake,
            cameraModel: photo.cameraModel,
            lensModel: photo.lensModel,
            iso: photo.iso,
            fNumber: photo.fNumber,
            exposureTime: photo.exposureTime,
            latitude: photo.latitude,
            longitude: photo.longitude,
            locationCity: photo.locationCity,
            locationCountryName: photo.locationCountryName,
            photoType: photo.photoType,
            ocrText: photo.ocrText,
            dominantColors: photo.dominantColors,
            tags: photo.tags,
            status: photo.processingStatus,
            createdAt: photo.createdAt,
            reviewStatus: photo.reviewStatus,
            flagColor: photo.flagColor,
            isPinned: photo.isPinned,
            dueDate: photo.dueDate,
            dateTaken: photo.dateTaken,
          },
        };
      }
    } else if (link.type === "task") {
      const response = await apiFetch(`/api/tasks/${link.id}`);
      if (response.ok) {
        const task = await response.json();
        return {
          ...link,
          title: task.title || "Untitled Task",
          description: task.description || "No description available",
          metadata: {
            status: task.status,
            dueDate: task.dueDate,
            assignedToId: task.assignedToId,
            tags: task.tags,
            processingStatus: task.processingStatus,
            createdAt: task.createdAt,
            reviewStatus: task.reviewStatus,
            flagColor: task.flagColor,
            isPinned: task.isPinned,
            isRecurring: task.isRecurring,
            cronExpression: task.cronExpression,
            nextRunAt: task.nextRunAt,
            lastRunAt: task.lastRunAt,
            completedAt: task.completedAt,
          },
        };
      }
    } else if (link.type === "note") {
      const response = await apiFetch(`/api/notes/${link.id}`);
      if (response.ok) {
        const note = await response.json();
        return {
          ...link,
          title: note.title || "Untitled Note",
          description:
            note.description ||
            note.content?.substring(0, 200) +
              (note.content?.length > 200 ? "..." : "") ||
            "No content available",
          metadata: {
            content: note.content,
            tags: note.tags,
            status: note.processingStatus,
            createdAt: note.createdAt,
            reviewStatus: note.reviewStatus,
            flagColor: note.flagColor,
            isPinned: note.isPinned,
            dueDate: note.dueDate,
            originalMimeType: note.originalMimeType,
          },
        };
      }
    }
  } catch (error) {
    console.error("Failed to fetch metadata for link:", link, error);
  }
  return link;
};

/**
 * Batch fetch metadata for multiple content links
 */
export const fetchContentMetadataBatch = async (
  links: ContentLink[],
): Promise<ContentLink[]> => {
  const metadataPromises = links.map(fetchContentMetadata);
  return Promise.all(metadataPromises);
};
