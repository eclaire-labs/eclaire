import type { JobContext } from "@eclaire/queue/core";
import { type BrowserContext, chromium } from "patchright";
import sharp from "sharp";
import { Readable } from "stream";
import { createChildLogger } from "../../../lib/logger.js";
import { buildKey, getStorage } from "../../../lib/storage/index.js";
import {
  fetchGitHubRepoInfo,
  type GitHubRepoInfo,
  generateGitHubTags,
  isGitHubUrl,
  parseGitHubUrl,
} from "../github-api.js";
import type {
  BookmarkHandler,
  BookmarkHandlerType,
  BookmarkJobData,
} from "./index.js";
import {
  extractContentFromHtml,
  generateBookmarkTags,
  generateOptimizedPdf,
} from "./utils.js";

const logger = createChildLogger("github-bookmark-handler");

/**
 * GitHub specific bookmark processing handler
 */
export async function processGitHubBookmark(
  ctx: JobContext<BookmarkJobData>,
): Promise<void> {
  const { bookmarkId, url: originalUrl, userId } = ctx.job.data;
  logger.info({ bookmarkId, userId }, "Processing with GITHUB handler");

  let browser: any = null;
  let context: BrowserContext | null = null;
  const allArtifacts: Record<string, any> = {};

  try {
    // Normalize URL
    const normalizedUrl = originalUrl.startsWith("http")
      ? originalUrl
      : `https://${originalUrl}`;
    allArtifacts.normalizedUrl = normalizedUrl;

    await ctx.startStage("validation");
    await ctx.updateStageProgress("validation", 10);

    // Parse GitHub URL to get owner and repo
    const githubInfo = parseGitHubUrl(normalizedUrl);
    if (!githubInfo) {
      throw new Error("Invalid GitHub URL format");
    }

    const { owner, repo } = githubInfo;
    logger.info({ owner, repo }, `Parsed GitHub URL: ${normalizedUrl}`);

    await ctx.completeStage("validation");

    await ctx.startStage("content_extraction");

    // Standard browser-based content extraction
    browser = await chromium.launch({
      headless: true,
      args: ["--use-mock-keychain"],
    });
    context = await browser.newContext({ viewport: null });
    const page = await context!.newPage();

    // Navigate to the URL with fallback strategies for slow-loading pages
    // biome-ignore lint/suspicious/noImplicitAnyLet: type inferred from page.goto
    let response;
    try {
      response = await page.goto(normalizedUrl, {
        waitUntil: "networkidle",
        timeout: 90000, // Increased timeout to 90 seconds
      });
    } catch (timeoutError: any) {
      if (timeoutError.message.includes("Timeout")) {
        logger.warn(
          { bookmarkId, url: normalizedUrl, error: timeoutError.message },
          "Navigation failed with networkidle, attempting with reduced wait condition",
        );

        // Fallback: try with domcontentloaded instead of networkidle
        try {
          response = await page.goto(normalizedUrl, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
          });

          // Wait a bit more for dynamic content to load
          await page.waitForTimeout(5000);
        } catch (fallbackError: any) {
          logger.error(
            { bookmarkId, url: normalizedUrl, error: fallbackError.message },
            "Both navigation attempts failed",
          );
          throw fallbackError;
        }
      } else {
        throw timeoutError;
      }
    }

    // Extract standard metadata
    allArtifacts.contentType = response?.headers()["content-type"] || "";
    allArtifacts.etag = response?.headers()["etag"] || "";
    allArtifacts.lastModified = response?.headers()["last-modified"] || "";

    // Take screenshots
    await page.setViewportSize({ width: 1920, height: 1080 });
    const ssDesktopBuffer = await page.screenshot({ type: "png" });

    // Generate thumbnail (lower resolution, 400x400, 85% quality)
    const storage = getStorage();
    const thumbnailBuffer = await sharp(ssDesktopBuffer)
      .resize(400, 400, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    const thumbnailKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "thumbnail.jpg",
    );
    await storage.writeBuffer(thumbnailKey, thumbnailBuffer, {
      contentType: "image/jpeg",
    });
    allArtifacts.thumbnailStorageId = thumbnailKey;

    // Generate screenshot (higher resolution, 1920x1440, 90% quality)
    const screenshotBuffer = await sharp(ssDesktopBuffer)
      .resize(1920, 1440, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    const screenshotKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "screenshot.jpg",
    );
    await storage.writeBuffer(screenshotKey, screenshotBuffer, {
      contentType: "image/jpeg",
    });
    allArtifacts.screenshotDesktopStorageId = screenshotKey;

    const ssFullPageBuffer = await page.screenshot({
      type: "png",
      fullPage: true,
    });
    const fullpageKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "screenshot-fullpage.png",
    );
    await storage.writeBuffer(fullpageKey, ssFullPageBuffer, {
      contentType: "image/png",
    });
    allArtifacts.screenshotFullPageStorageId = fullpageKey;

    await page.setViewportSize({ width: 375, height: 667 });
    const ssMobileBuffer = await page.screenshot({ type: "png" });
    const mobileKey = buildKey(
      userId,
      "bookmarks",
      bookmarkId,
      "screenshot-mobile.png",
    );
    await storage.writeBuffer(mobileKey, ssMobileBuffer, {
      contentType: "image/png",
    });
    allArtifacts.screenshotMobileStorageId = mobileKey;

    // Reset viewport for PDF generation
    await page.setViewportSize({ width: 1920, height: 1080 });

    const pdfBuffer = await generateOptimizedPdf(page, bookmarkId);
    const pdfKey = buildKey(userId, "bookmarks", bookmarkId, "content.pdf");
    await storage.writeBuffer(pdfKey, pdfBuffer, {
      contentType: "application/pdf",
    });
    allArtifacts.pdfStorageId = pdfKey;

    // Extract HTML content
    const rawHtml = await page.content();
    const contentData = await extractContentFromHtml(
      rawHtml,
      normalizedUrl,
      userId,
      bookmarkId,
    );
    Object.assign(allArtifacts, contentData);

    // GitHub-specific API data extraction
    logger.info({ owner, repo }, "Fetching GitHub API data");
    const { repoInfo, error: githubError } = await fetchGitHubRepoInfo(
      owner,
      repo,
    );

    if (githubError || !repoInfo) {
      logger.warn(
        { error: githubError },
        `Failed to fetch GitHub API data for ${owner}/${repo}`,
      );
      // Continue with regular processing but log the error
    } else {
      // Override title and description with GitHub data if available
      allArtifacts.title = repoInfo.name || allArtifacts.title;
      allArtifacts.description =
        repoInfo.description || allArtifacts.description;
      allArtifacts.author = repoInfo.owner;

      // Store GitHub-specific metadata
      allArtifacts.rawMetadata = {
        ...allArtifacts.rawMetadata,
        github: {
          owner: repoInfo.owner,
          repo: repoInfo.name,
          stars: repoInfo.stars,
          forks: repoInfo.forks,
          watchers: repoInfo.watchers,
          language: repoInfo.language,
          topics: repoInfo.topics,
          license: repoInfo.license,
          lastCommitDate: repoInfo.lastCommitDate,
          latestRelease: repoInfo.latestRelease,
          repositoryData: repoInfo.repositoryData,
        },
      };

      // Save README content if available
      if (repoInfo.readmeContent) {
        const readmeKey = buildKey(
          userId,
          "bookmarks",
          bookmarkId,
          "readme.md",
        );
        await storage.writeBuffer(
          readmeKey,
          Buffer.from(repoInfo.readmeContent),
          { contentType: "text/markdown" },
        );
        allArtifacts.readmeStorageId = readmeKey;

        // Include README content in extracted text for better AI processing
        allArtifacts.extractedText =
          (allArtifacts.extractedText || "") + "\n\n" + repoInfo.readmeContent;
      }
    }

    await ctx.completeStage("content_extraction");

    await ctx.startStage("ai_tagging");

    // Generate GitHub-specific tags
    let githubTags: string[] = [];
    if (repoInfo) {
      githubTags = generateGitHubTags(repoInfo);
    }

    // Also generate AI tags using the enhanced content
    const aiTags = await generateBookmarkTags(
      allArtifacts.extractedText,
      allArtifacts.title || "",
      false,
    );

    // Combine GitHub tags with AI tags, removing duplicates
    allArtifacts.tags = Array.from(new Set([...githubTags, ...aiTags]));

    // Remove extractedText from artifacts - it's stored in blob storage via extractedTxtStorageId
    // The artifact processor will load it from storage when updating the domain table
    const { extractedText: _excludeText, ...finalArtifacts } = allArtifacts;

    // Complete the final stage with artifacts - job completion is implicit when handler returns
    await ctx.completeStage("ai_tagging", finalArtifacts);
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

/**
 * GitHub bookmark handler implementation
 */
export class GitHubBookmarkHandler implements BookmarkHandler {
  canHandle(url: string): boolean {
    return isGitHubUrl(url);
  }

  getHandlerType(): BookmarkHandlerType {
    return "github";
  }

  async processBookmark(ctx: JobContext<BookmarkJobData>): Promise<void> {
    return processGitHubBookmark(ctx);
  }
}

// Export singleton instance
export const githubHandler = new GitHubBookmarkHandler();

// Re-export GitHub API utilities for convenience
export {
  fetchGitHubRepoInfo,
  type GitHubRepoInfo,
  generateGitHubTags,
  isGitHubUrl,
  parseGitHubUrl,
} from "../github-api.js";
