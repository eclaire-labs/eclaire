// lib/mime-types.ts

export const BOOKMARK_MIMES = {
  URI_LIST: ["text/uri-list", "text/x-uri", "application/x-url"],
  URL_IN_TEXT: ["text/plain", "text/rtf", "text/markdown", "text/html"],
};

export const NOTE_MIMES = ["text/plain", "text/rtf", "application/rtf"];

export const PHOTO_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/tiff",
  "image/bmp",
  "image/svg+xml",
  "image/avif",
];

export const MEDIA_AUDIO_MIMES = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/ogg",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
  "audio/aiff",
  "audio/x-aiff",
];

export const MEDIA_VIDEO_MIMES = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/webm",
  "video/ogg",
  "video/mpeg",
  "video/3gpp",
  "video/3gpp2",
];

export const MEDIA_MIMES = [...MEDIA_AUDIO_MIMES, ...MEDIA_VIDEO_MIMES];

export const DOCUMENT_MIMES = {
  // A set for quick lookups
  SET: new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "text/rtf",
    "application/rtf",
    "text/markdown",
    "text/html",
    "text/csv",
    "application/json",
    "application/xml",
    "text/plain",
    // Apple iWork
    "application/vnd.apple.pages",
    "application/vnd.apple.numbers",
    "application/vnd.apple.keynote",
    // OpenXML formats
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  ]),
  // A prefix for wildcard matching
  OPENXML_PREFIX: "application/vnd.openxmlformats-officedocument.",
};
