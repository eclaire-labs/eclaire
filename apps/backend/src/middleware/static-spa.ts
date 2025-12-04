/**
 * SPA Static File Serving Middleware for Hono
 *
 * Serves the React SPA built by Vite from the frontend dist/ folder.
 * For non-API routes, serves index.html to enable client-side routing.
 */

import { type Context, type Next } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import path from "node:path";
import fs from "node:fs";

// Static file extensions to serve directly
const STATIC_EXTENSIONS = new Set([
  ".js",
  ".css",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".json",
  ".webp",
  ".map",
  ".webmanifest",
  ".txt",
  ".xml",
]);

// Cache the index.html content for performance
let indexHtmlCache: string | null = null;
let indexHtmlPath: string | null = null;

function getIndexHtml(frontendDistPath: string): string | null {
  if (indexHtmlCache && indexHtmlPath === frontendDistPath) {
    return indexHtmlCache;
  }

  const indexPath = path.join(frontendDistPath, "index.html");
  if (fs.existsSync(indexPath)) {
    indexHtmlCache = fs.readFileSync(indexPath, "utf-8");
    indexHtmlPath = frontendDistPath;
    return indexHtmlCache;
  }
  return null;
}

/**
 * Determines the frontend dist path based on environment
 */
function getFrontendDistPath(): string {
  // Check environment variable first (set in Docker)
  if (process.env.FRONTEND_DIST_PATH) {
    return process.env.FRONTEND_DIST_PATH;
  }

  // Development: look for frontend/dist relative to backend
  const devPath = path.resolve(__dirname, "../../../frontend/dist");
  if (fs.existsSync(devPath)) {
    return devPath;
  }

  // Docker production: frontend-dist in app root
  const prodPath = path.resolve(__dirname, "../../frontend-dist");
  if (fs.existsSync(prodPath)) {
    return prodPath;
  }

  // Fallback - may not exist
  return devPath;
}

/**
 * Creates the SPA middleware
 *
 * @returns Hono middleware that serves static files and falls back to index.html
 */
export function createSpaMiddleware() {
  const frontendDistPath = getFrontendDistPath();
  const distExists = fs.existsSync(frontendDistPath);

  if (!distExists) {
    console.log(
      `[SPA] Frontend dist not found at ${frontendDistPath} - SPA serving disabled`,
    );
    return async (_c: Context, next: Next) => next();
  }

  console.log(`[SPA] Serving frontend from ${frontendDistPath}`);

  // Create the static file server
  const staticHandler = serveStatic({ root: frontendDistPath });

  return async (c: Context, next: Next) => {
    const requestPath = c.req.path;

    // Skip API routes and health endpoint - let them pass through
    if (requestPath.startsWith("/api/") || requestPath === "/health") {
      return next();
    }

    // Check for static file by extension
    const ext = path.extname(requestPath).toLowerCase();
    if (STATIC_EXTENSIONS.has(ext)) {
      // Try to serve the static file
      const filePath = path.join(frontendDistPath, requestPath);
      if (fs.existsSync(filePath)) {
        // Use serveStatic for proper MIME types and caching
        return staticHandler(c, next);
      }
      // File doesn't exist - fall through to 404 or SPA fallback
    }

    // For all other paths (SPA routes), serve index.html
    const indexHtml = getIndexHtml(frontendDistPath);
    if (indexHtml) {
      return c.html(indexHtml);
    }

    // No index.html found - let next middleware handle it
    return next();
  };
}

/**
 * Clears the index.html cache (useful for development/hot reload)
 */
export function clearSpaCache() {
  indexHtmlCache = null;
  indexHtmlPath = null;
}
