import type { Hono, MiddlewareHandler } from "hono";
import { generateSpecs, type GenerateSpecOptions } from "hono-openapi";
import z from "zod/v4";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../config/index.js";

// Read version from build-info.json (generated during build) or fallback to package.json
let version = "0.0.0";
try {
  const buildInfoPath = resolve(import.meta.dirname, "../../../../build-info.json");
  const buildInfo = JSON.parse(readFileSync(buildInfoPath, "utf8"));
  version = buildInfo.version || "0.0.0";
} catch {
  // Fallback: If build-info.json doesn't exist, use a default version
  // This can happen during development or when generate:openapi runs before build.sh
  version = "0.0.0-dev";
}

// =============================================================================
// Reusable Zod Schemas for OpenAPI
// =============================================================================.

export const ErrorResponseSchema = z.object({
  error: z.string().describe("A short error code or type."),
  message: z.string().optional().describe("A human-readable error message."),
  details: z.any().optional().describe("Additional details for debugging."),
});

export const PaginationSchema = z.object({
  totalCount: z
    .number()
    .int()
    .positive()
    .describe("Total number of items available."),
  limit: z
    .number()
    .int()
    .positive()
    .describe("The limit for the number of items on the current page."),
  offset: z
    .number()
    .int()
    .nonnegative()
    .describe("The offset of the items returned."),
});

// =============================================================================
// Main OpenAPI Configuration
// =============================================================================

export const getOpenAPIDocument = (app: Hono<any>) => {
  const documentation: GenerateSpecOptions["documentation"] = {
    info: {
      title: "Eclaire API",
      version: version,
      description: `
# Introduction

Welcome to the Eclaire API! This API provides programmatic access to manage everything in the system including bookmarks, notes, photos, documents, AI interactions and more.

The API is designed to be predictable and resource-oriented, using standard HTTP response codes, authentication, and verbs.

## Getting Started

To get started, generate an API key in the application Settings UI. All API requests must be authenticated either through session cookies (when using the web interface) or with an API key.

### API Key Authentication

API keys follow the format: \`sk-{keyId}-{secret}\`

You can authenticate using either:
- **Bearer token**: Include the API key in the Authorization header as \`Authorization: Bearer sk-{keyId}-{secret}\`
- **X-API-Key header**: Include the API key directly as \`X-API-Key: sk-{keyId}-{secret}\`
      `,
      contact: {
        name: "Eclaire Labs",
        email: "info@eclaire.co",
        url: "https://eclaire.co/",
      },
    },
    servers: [
      {
        url: config.services.backendUrl,
        description: config.isProduction ? "Production Server" : "Development Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "API requests are authenticated using either session cookies or API keys. For API keys, use the format 'sk-{keyId}-{secret}' as the Bearer token. Alternatively, you can use the X-API-Key header with the same API key format.",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      {
        name: "All Content",
        description: "Universal endpoints for searching and creating content.",
      },
      {
        name: "Tasks",
        description: "Manage your to-do lists and tasks.",
      },
      {
        name: "Task Comments",
        description: "Manage comments on tasks for collaboration and notes.",
      },
      {
        name: "Bookmarks",
        description:
          "Manage your web bookmarks, including metadata and archived content.",
      },
      {
        name: "Bookmark Assets",
        description:
          "Access bookmark-related assets like screenshots and archived content.",
      },
      {
        name: "Documents",
        description:
          "Upload, search, and manage your personal or work documents.",
      },
      {
        name: "Document Files",
        description: "Access document files, thumbnails, and content.",
      },
      {
        name: "Document Assets",
        description: "Manage document-related assets and metadata.",
      },
      {
        name: "Photos",
        description:
          "Store and organize your photos with automatic metadata extraction.",
      },
      {
        name: "Photo Assets",
        description: "Access photo files, thumbnails, and analysis data.",
      },
      {
        name: "Notes",
        description: "Create, update, and search your text-based notes.",
      },
      {
        name: "AI & Prompts",
        description: "Interact with the AI assistant to query your data.",
      },
      {
        name: "AI Conversations",
        description: "Manage AI conversation history and interactions.",
      },
      {
        name: "AI Model",
        description: "Information about the current AI model configuration.",
      },
      {
        name: "History",
        description: "View your activity and interaction history.",
      },
      {
        name: "User",
        description: "Manage your user profile and settings.",
      },
      {
        name: "Job Processing",
        description:
          "System job processing endpoints used by workers. Not for public use.",
      },
    ],
  };

  const handler: MiddlewareHandler = async (c) => {
    const specs = await generateSpecs(app, { documentation });
    return c.json(specs);
  };

  return handler;
};
