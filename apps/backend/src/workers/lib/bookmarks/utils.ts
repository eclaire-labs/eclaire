import { type AIMessage, callAI } from "@eclaire/ai";
import { Readability } from "@mozilla/readability";
import axios from "axios";
import { convert as convertHtmlToText } from "html-to-text";
import { JSDOM } from "jsdom";
import type { Page } from "patchright";
import { Readable } from "stream";
import TurndownService from "turndown";
import { createChildLogger } from "../../../lib/logger.js";
import { buildKey, getStorage } from "../../../lib/storage/index.js";

const logger = createChildLogger("bookmark-utils");

// --- SHARED UTILITY FUNCTIONS ---

/**
 * Extract content from HTML using Readability and convert to both markdown and plain text
 */
export async function extractContentFromHtml(
  rawHtml: string,
  url: string,
  userId: string,
  bookmarkId: string,
  prefetchedFaviconStorageId?: string | null,
): Promise<{
  title: string;
  description: string;
  author: string | null;
  lang: string;
  extractedMdStorageId: string;
  extractedTxtStorageId: string;
  rawHtmlStorageId: string;
  readableHtmlStorageId: string;
  faviconStorageId: string | null;
  extractedText: string;
  rawMetadata?: Record<string, any>;
}> {
  let readableHtml = "";
  let article: any = null;

  try {
    // Use JSDOM with JavaScript execution disabled
    const dom = new JSDOM(rawHtml, {
      url: url,
      runScripts: "outside-only", // Disable all JavaScript execution
      // Default: no external resource loading (prevents CSS parsing errors)
    });
    const document = dom.window.document;

    // Remove all script tags to prevent any potential issues
    const scripts = document.querySelectorAll("script");
    scripts.forEach((script) => script.remove());

    article = new Readability(document).parse();
    readableHtml = article?.content || "";

    // --- Helper functions for favicon processing ---
    const getFileExtensionFromUrl = (url: string): string | null => {
      try {
        const pathname = new URL(url).pathname;
        const lastDot = pathname.lastIndexOf(".");
        if (lastDot !== -1 && lastDot < pathname.length - 1) {
          return pathname.substring(lastDot);
        }
      } catch {
        // Invalid URL, ignore
      }
      return null;
    };

    const getExtensionFromContentType = (contentType: string): string => {
      if (!contentType) {
        return ".ico"; // Default fallback for undefined/null/empty content type
      }
      const type = contentType.toLowerCase().split(";")[0]?.trim() || "";
      switch (type) {
        case "image/svg+xml":
          return ".svg";
        case "image/png":
          return ".png";
        case "image/x-icon":
        case "image/vnd.microsoft.icon":
          return ".ico";
        case "image/jpeg":
        case "image/jpg":
          return ".jpg";
        case "image/gif":
          return ".gif";
        default:
          return ".ico"; // Default fallback
      }
    };

    const generateFaviconFileName = (
      faviconUrl: string,
      contentType: string,
    ): string => {
      // First try to get extension from URL
      const urlExtension = getFileExtensionFromUrl(faviconUrl);
      if (urlExtension) {
        return `favicon${urlExtension}`;
      }

      // Fallback to content type
      const extension = getExtensionFromContentType(contentType);
      return `favicon${extension}`;
    };

    // --- Favicon Handling ---
    // Use prefetched favicon if available (fetched via Playwright in the processor)
    // Otherwise fall back to axios-based fetching (for other code paths)
    let faviconStorageId: string | null = prefetchedFaviconStorageId || null;

    if (!faviconStorageId) {
      try {
        const faviconUrl =
          document.querySelector("link[rel='icon']")?.getAttribute("href") ||
          document
            .querySelector("link[rel='shortcut icon']")
            ?.getAttribute("href");

        if (faviconUrl) {
          const absoluteFaviconUrl = new URL(faviconUrl, url).href;
          logger.debug({ absoluteFaviconUrl }, "Found favicon link in HTML");
          const response = await axios.get(absoluteFaviconUrl, {
            responseType: "arraybuffer",
            timeout: 10000,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "image/*,*/*",
            },
          });
          const faviconBuffer = Buffer.from(response.data);
          if (faviconBuffer.length > 0) {
            const contentType =
              response.headers["content-type"] || "image/x-icon";
            const fileName = generateFaviconFileName(
              absoluteFaviconUrl,
              contentType,
            );

            const storage = getStorage();
            const faviconKey = buildKey(
              userId,
              "bookmarks",
              bookmarkId,
              fileName,
            );
            await storage.writeBuffer(faviconKey, faviconBuffer, {
              contentType,
            });
            faviconStorageId = faviconKey;

            logger.debug(
              { fileName, contentType },
              "Favicon saved with proper extension",
            );
          }
        } else {
          logger.debug("No favicon link found, trying /favicon.ico");
          const rootFaviconUrl = new URL("/favicon.ico", url).href;
          const response = await axios.get(rootFaviconUrl, {
            responseType: "arraybuffer",
            timeout: 10000,
            validateStatus: (status) => status === 200,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "image/*,*/*",
            },
          });
          const faviconBuffer = Buffer.from(response.data);
          if (faviconBuffer.length > 0) {
            const contentType =
              response.headers["content-type"] || "image/x-icon";

            const storage = getStorage();
            const faviconKey = buildKey(
              userId,
              "bookmarks",
              bookmarkId,
              "favicon.ico",
            );
            await storage.writeBuffer(faviconKey, faviconBuffer, {
              contentType,
            });
            faviconStorageId = faviconKey;
          }
        }
      } catch (error: any) {
        logger.warn(
          {
            bookmarkId,
            url,
            error: error.response ? error.response.status : error.message,
          },
          "Could not fetch or save favicon",
        );
      }
    }

    // Save raw and readable HTML content
    const storageForHtml = getStorage();
    const rawHtmlKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "content-raw.html",
    );
    await storageForHtml.writeBuffer(rawHtmlKey, Buffer.from(rawHtml), {
      contentType: "text/html",
    });
    const rawHtmlStorageId = rawHtmlKey;

    const readableHtmlKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "content-readable.html",
    );
    await storageForHtml.writeBuffer(
      readableHtmlKey,
      Buffer.from(readableHtml),
      { contentType: "text/html" },
    );
    const readableHtmlStorageId = readableHtmlKey;

    // Initialize turndown service for markdown conversion
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      fence: "```",
      bulletListMarker: "-",
      strongDelimiter: "**",
      emDelimiter: "*",
    });

    // Convert to markdown
    const markdownContent = turndownService.turndown(readableHtml);

    // Convert to plain text
    const plainTextContent = convertHtmlToText(readableHtml, {
      wordwrap: false,
    });

    // Save both versions to storage
    const mdKey = buildKey(userId, "bookmarks", bookmarkId, "extracted.md");
    await storageForHtml.writeBuffer(mdKey, Buffer.from(markdownContent), {
      contentType: "text/markdown",
    });
    const extractedMdStorageId = mdKey;

    const txtKey = buildKey(userId, "bookmarks", bookmarkId, "extracted.txt");
    await storageForHtml.writeBuffer(txtKey, Buffer.from(plainTextContent), {
      contentType: "text/plain",
    });
    const extractedTxtStorageId = txtKey;

    return {
      title: article?.title || document.title || "",
      description:
        article?.excerpt ||
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") ||
        "",
      author: article?.byline || null,
      lang: document.documentElement.getAttribute("lang") || "en",
      extractedMdStorageId,
      extractedTxtStorageId,
      rawHtmlStorageId,
      readableHtmlStorageId,
      faviconStorageId,
      extractedText: plainTextContent,
      rawMetadata: {},
    };
  } catch (error: any) {
    logger.error(
      {
        bookmarkId,
        url,
        error: error.message,
        stack: error.stack,
      },
      "Error processing HTML with JSDOM",
    );

    // Re-throw the error to fail the job cleanly
    throw error;
  }
}

/**
 * Generate optimized PDF from page
 */
export async function generateOptimizedPdf(
  page: Page,
  bookmarkId: string,
): Promise<Buffer> {
  logger.debug({ bookmarkId }, "Generating optimized PDF");

  // Wait for images to load with per-image timeout (5s each)
  await page.evaluate(() =>
    Promise.all(
      Array.from((globalThis as any).document.images)
        .filter((img: any) => !img.complete)
        .map((img: any) =>
          Promise.race([
            new Promise((resolve) => {
              img.onload = img.onerror = resolve;
            }),
            new Promise((resolve) => setTimeout(resolve, 5000)),
          ]),
        ),
    ),
  );

  await page.waitForTimeout(3000);
  await page.emulateMedia({ media: "screen" });

  return await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
  });
}

/**
 * Generate bookmark tags using AI
 */
export async function generateBookmarkTags(
  contentText: string,
  title: string,
  isTwitter: boolean = false,
): Promise<string[]> {
  try {
    const contentType = isTwitter ? "Twitter/X post" : "webpage";
    logger.debug({ contentType }, "Calling AI for bookmark tag generation");

    const messages: AIMessage[] = [
      {
        role: "system",
        content:
          "You are a helpful assistant that analyzes web content and generates relevant tags. Always respond with a JSON array of strings.",
      },
      {
        role: "user",
        content: `Based on the following text from a ${contentType}, generate a list of maximum 5 relevant tags as a JSON array of strings. The title of the ${contentType} is "${title}". Content: \n\n${contentText.substring(0, 4000)}`,
      },
    ];

    const aiResponse = await callAI(messages, "workers", {
      temperature: 0.1,
      maxTokens: 200,
      timeout: 60000,
    });

    const jsonMatch = aiResponse.content.match(/```json\s*([\s\S]*?)\s*```/);
    const cleanedJsonString = jsonMatch?.[1] || aiResponse.content;
    const parsed = JSON.parse(cleanedJsonString);

    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string");
    }

    if (parsed && typeof parsed === "object" && Array.isArray(parsed.tags)) {
      return parsed.tags.filter((t: any): t is string => typeof t === "string");
    }

    return [];
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Error generating bookmark tags with AI",
    );
    return [];
  }
}
