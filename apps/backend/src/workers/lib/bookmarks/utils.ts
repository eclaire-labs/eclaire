import { type AIMessage, callAI } from "@eclaire/ai";
import { Readability } from "@mozilla/readability";
import axios from "axios";
import { convert as convertHtmlToText } from "html-to-text";
import { JSDOM } from "jsdom";
import type { Page } from "patchright";
import TurndownService from "turndown";
import { tables, strikethrough } from "turndown-plugin-gfm";
import { createChildLogger } from "../../../lib/logger.js";
import { buildKey, getStorage } from "../../../lib/storage/index.js";
import type { PrefetchedArticle } from "./lightweight-fetch.js";

const logger = createChildLogger("bookmark-utils");

// --- STRUCTURED METADATA EXTRACTION ---

/**
 * Extract structured metadata (OpenGraph, JSON-LD, Twitter cards) from an HTML document.
 * This provides rich, pre-structured information that many sites include.
 */
// biome-ignore lint/suspicious/noExplicitAny: dynamic metadata from various structured data formats
function extractStructuredMetadata(document: Document): Record<string, any> {
  // biome-ignore lint/suspicious/noExplicitAny: dynamic metadata from various structured data formats
  const metadata: Record<string, any> = {};

  // OpenGraph tags
  // biome-ignore lint/suspicious/noExplicitAny: dynamic OG metadata
  const og: Record<string, any> = {};
  const ogTags = document.querySelectorAll('meta[property^="og:"]');
  ogTags.forEach((tag) => {
    const property = tag.getAttribute("property")?.replace("og:", "");
    const content = tag.getAttribute("content");
    if (property && content) {
      og[property] = content;
    }
  });
  if (Object.keys(og).length > 0) {
    metadata.opengraph = og;
  }

  // Twitter card tags
  // biome-ignore lint/suspicious/noExplicitAny: dynamic Twitter card metadata
  const twitter: Record<string, any> = {};
  const twitterTags = document.querySelectorAll('meta[name^="twitter:"]');
  twitterTags.forEach((tag) => {
    const name = tag.getAttribute("name")?.replace("twitter:", "");
    const content = tag.getAttribute("content");
    if (name && content) {
      twitter[name] = content;
    }
  });
  if (Object.keys(twitter).length > 0) {
    metadata.twitter = twitter;
  }

  // JSON-LD structured data
  const jsonLdScripts = document.querySelectorAll(
    'script[type="application/ld+json"]',
  );
  // biome-ignore lint/suspicious/noExplicitAny: JSON-LD can be any valid JSON structure
  const jsonLdItems: any[] = [];
  jsonLdScripts.forEach((script) => {
    try {
      const parsed = JSON.parse(script.textContent || "");
      jsonLdItems.push(parsed);
    } catch {
      // Ignore invalid JSON-LD
    }
  });
  if (jsonLdItems.length > 0) {
    metadata.jsonLd = jsonLdItems.length === 1 ? jsonLdItems[0] : jsonLdItems;
  }

  return metadata;
}

// --- TURNDOWN SERVICE (singleton, reused across calls) ---

function createTurndownService(): TurndownService {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    fence: "```",
    bulletListMarker: "-",
    strongDelimiter: "**",
    emDelimiter: "*",
  });

  // GFM plugins: table support and strikethrough
  turndownService.use([tables, strikethrough]);

  // Custom rule for code blocks with language hints
  turndownService.addRule("codeBlockWithLang", {
    filter: (node) =>
      node.nodeName === "PRE" &&
      node.firstChild !== null &&
      node.firstChild.nodeName === "CODE",
    replacement: (_content, node) => {
      const code = (node as HTMLElement).querySelector("code");
      if (!code) return `\n\`\`\`\n${_content}\n\`\`\`\n`;
      const langClass = code.className || "";
      const langMatch = langClass.match(
        /(?:language-|lang-|hljs-)([a-zA-Z0-9_+-]+)/,
      );
      const lang = langMatch?.[1] || "";
      return `\n\`\`\`${lang}\n${code.textContent || ""}\n\`\`\`\n`;
    },
  });

  return turndownService;
}

const turndownService = createTurndownService();

// --- STYLED READABLE HTML ---

/**
 * Generate a self-contained styled readable HTML document for offline reading.
 */
function generateStyledReadableHtml(
  title: string,
  byline: string | null,
  content: string,
  lang: string,
): string {
  const escapedTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const bylineHtml = byline
    ? `<p class="byline">${byline.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="${lang || "en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      max-width: 720px; margin: 40px auto; padding: 0 24px;
      font-family: Georgia, 'Times New Roman', serif;
      line-height: 1.7; color: #1a1a1a; background: #fff;
    }
    h1 { font-size: 1.8em; line-height: 1.3; margin-bottom: 0.3em; }
    h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
    .byline { color: #666; font-style: italic; margin-bottom: 2em; }
    img { max-width: 100%; height: auto; border-radius: 4px; }
    pre {
      background: #f5f5f5; padding: 1em; overflow-x: auto;
      border-radius: 6px; font-size: 0.9em; line-height: 1.5;
    }
    code {
      background: #f0f0f0; padding: 2px 5px; border-radius: 3px;
      font-size: 0.9em;
    }
    pre code { background: none; padding: 0; }
    blockquote {
      border-left: 3px solid #ccc; padding-left: 1em;
      margin-left: 0; color: #555; font-style: italic;
    }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    a { color: #0066cc; }
    hr { border: none; border-top: 1px solid #e0e0e0; margin: 2em 0; }
    figure { margin: 1.5em 0; }
    figcaption { color: #666; font-size: 0.9em; margin-top: 0.5em; }
  </style>
</head>
<body>
  <h1>${escapedTitle}</h1>
  ${bylineHtml}
  ${content}
</body>
</html>`;
}

// --- SHARED UTILITY FUNCTIONS ---

/**
 * Extract content from HTML using Readability and convert to both markdown and plain text.
 * Also extracts structured metadata (OpenGraph, JSON-LD, Twitter cards) and generates
 * a styled readable HTML version for offline reading.
 */
export async function extractContentFromHtml(
  rawHtml: string,
  url: string,
  userId: string,
  bookmarkId: string,
  prefetchedFaviconStorageId?: string | null,
  prefetchedArticle?: PrefetchedArticle | null,
): Promise<{
  title: string;
  description: string;
  author: string | null;
  lang: string;
  extractedMdStorageId: string;
  extractedTxtStorageId: string;
  rawHtmlStorageId: string;
  readableHtmlStorageId: string;
  readableStyledHtmlStorageId: string;
  faviconStorageId: string | null;
  extractedText: string;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic external metadata from various sources
  rawMetadata?: Record<string, any>;
}> {
  let readableHtml = "";
  // biome-ignore lint/suspicious/noExplicitAny: Readability parse result, no exported type available
  let article: any = null;

  try {
    // Use JSDOM with no script execution (default behavior when runScripts is omitted)
    const dom = new JSDOM(rawHtml, {
      url: url,
    });
    const document = dom.window.document;

    // Extract structured metadata before removing scripts (JSON-LD lives in script tags)
    const structuredMetadata = extractStructuredMetadata(document);

    // Remove all script tags after metadata extraction
    const scripts = document.querySelectorAll("script");
    scripts.forEach((script) => {
      script.remove();
    });

    article = prefetchedArticle || new Readability(document).parse();
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
        return ".ico";
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
          return ".ico";
      }
    };

    const generateFaviconFileName = (
      faviconUrl: string,
      contentType: string,
    ): string => {
      const urlExtension = getFileExtensionFromUrl(faviconUrl);
      if (urlExtension) {
        return `favicon${urlExtension}`;
      }
      const extension = getExtensionFromContentType(contentType);
      return `favicon${extension}`;
    };

    // --- Favicon Handling ---
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
      } catch (error: unknown) {
        logger.warn(
          {
            bookmarkId,
            url,
            error: error instanceof Error ? error.message : String(error),
          },
          "Could not fetch or save favicon",
        );
      }
    }

    // Generate all content variants (CPU-bound, must be sequential)
    const title = article?.title || document.title || "";
    const lang = document.documentElement.getAttribute("lang") || "en";
    const styledHtml = generateStyledReadableHtml(
      title,
      article?.byline || null,
      readableHtml,
      lang,
    );
    const markdownContent = turndownService.turndown(readableHtml);
    const plainTextContent = convertHtmlToText(readableHtml, {
      wordwrap: false,
    });

    // Build storage keys
    const storage = getStorage();
    const rawHtmlKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "content-raw.html",
    );
    const readableHtmlKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "content-readable.html",
    );
    const styledHtmlKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "content-readable-styled.html",
    );
    const mdKey = buildKey(userId, "bookmarks", bookmarkId, "extracted.md");
    const txtKey = buildKey(userId, "bookmarks", bookmarkId, "extracted.txt");

    // Write all files in parallel (all independent I/O)
    await Promise.all([
      storage.writeBuffer(rawHtmlKey, Buffer.from(rawHtml), {
        contentType: "text/html",
      }),
      storage.writeBuffer(readableHtmlKey, Buffer.from(readableHtml), {
        contentType: "text/html",
      }),
      storage.writeBuffer(styledHtmlKey, Buffer.from(styledHtml), {
        contentType: "text/html",
      }),
      storage.writeBuffer(mdKey, Buffer.from(markdownContent), {
        contentType: "text/markdown",
      }),
      storage.writeBuffer(txtKey, Buffer.from(plainTextContent), {
        contentType: "text/plain",
      }),
    ]);

    const rawHtmlStorageId = rawHtmlKey;
    const readableHtmlStorageId = readableHtmlKey;
    const readableStyledHtmlStorageId = styledHtmlKey;
    const extractedMdStorageId = mdKey;
    const extractedTxtStorageId = txtKey;

    return {
      title,
      description:
        article?.excerpt ||
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") ||
        "",
      author: article?.byline || null,
      lang,
      extractedMdStorageId,
      extractedTxtStorageId,
      rawHtmlStorageId,
      readableHtmlStorageId,
      readableStyledHtmlStorageId,
      faviconStorageId,
      extractedText: plainTextContent,
      rawMetadata:
        Object.keys(structuredMetadata).length > 0
          ? { structured: structuredMetadata }
          : {},
    };
  } catch (error: unknown) {
    logger.error(
      {
        bookmarkId,
        url,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error processing HTML with JSDOM",
    );

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
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: browser-context code, no DOM types available in Node
    const images = Array.from((globalThis as any).document.images);
    return Promise.all(
      images
        // biome-ignore lint/suspicious/noExplicitAny: browser-context HTMLImageElement, no DOM types available
        .filter((img: any) => !img.complete)
        // biome-ignore lint/suspicious/noExplicitAny: browser-context HTMLImageElement, no DOM types available
        .map((img: any) =>
          Promise.race([
            new Promise((resolve) => {
              img.onload = img.onerror = resolve;
            }),
            new Promise((resolve) => setTimeout(resolve, 5000)),
          ]),
        ),
    );
  });

  await page.waitForTimeout(1000);
  await page.emulateMedia({ media: "screen" });

  return await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
  });
}

/**
 * Generate bookmark tags using AI.
 * Uses up to 8000 chars of content and includes structured metadata context when available.
 */
export async function generateBookmarkTags(
  contentText: string,
  title: string,
  isTwitter: boolean = false,
  // biome-ignore lint/suspicious/noExplicitAny: structured metadata from various sources
  structuredMetadata?: Record<string, any>,
): Promise<string[]> {
  try {
    const contentType = isTwitter ? "Twitter/X post" : "webpage";
    logger.debug({ contentType }, "Calling AI for bookmark tag generation");

    // Build metadata context string if structured metadata is available
    let metadataContext = "";
    if (structuredMetadata && Object.keys(structuredMetadata).length > 0) {
      const parts: string[] = [];
      if (structuredMetadata.opengraph?.type) {
        parts.push(`Type: ${structuredMetadata.opengraph.type}`);
      }
      if (structuredMetadata.opengraph?.site_name) {
        parts.push(`Site: ${structuredMetadata.opengraph.site_name}`);
      }
      if (structuredMetadata.jsonLd?.["@type"]) {
        parts.push(`Schema type: ${structuredMetadata.jsonLd["@type"]}`);
      }
      if (structuredMetadata.jsonLd?.keywords) {
        const keywords = Array.isArray(structuredMetadata.jsonLd.keywords)
          ? structuredMetadata.jsonLd.keywords.join(", ")
          : structuredMetadata.jsonLd.keywords;
        parts.push(`Keywords: ${keywords}`);
      }
      if (parts.length > 0) {
        metadataContext = `\nMetadata: ${parts.join(". ")}.`;
      }
    }

    const messages: AIMessage[] = [
      {
        role: "system",
        content:
          "You are a helpful assistant that analyzes web content and generates relevant tags. Always respond with a JSON array of strings.",
      },
      {
        role: "user",
        content: `Based on the following text from a ${contentType}, generate a list of maximum 5 relevant tags as a JSON array of strings. The title of the ${contentType} is "${title}".${metadataContext} Content: \n\n${contentText.substring(0, 8000)}`,
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
      return parsed.tags.filter(
        (t: unknown): t is string => typeof t === "string",
      );
    }

    return [];
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Error generating bookmark tags with AI",
    );
    throw error;
  }
}
