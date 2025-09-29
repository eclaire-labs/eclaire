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
