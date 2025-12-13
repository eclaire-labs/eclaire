import type { Job } from "bullmq";
import { type BrowserContext, chromium } from "patchright";
import sharp from "sharp";
import { Readable } from "stream";
import {
  fetchGitHubRepoInfo,
  type GitHubRepoInfo,
  generateGitHubTags,
  isGitHubUrl,
  parseGitHubUrl,
} from "../github-api.js";
import { createChildLogger } from "../../../lib/logger.js";
import type { ProcessingReporter } from "../processing-reporter.js";
import { objectStorage } from "../../../lib/storage.js";
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
  job: Job<BookmarkJobData>,
  reporter: ProcessingReporter,
): Promise<void> {
  const { bookmarkId, url: originalUrl, userId } = job.data;
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

    await reporter.updateStage("validation", "processing", 10);

    // Parse GitHub URL to get owner and repo
    const githubInfo = parseGitHubUrl(normalizedUrl);
    if (!githubInfo) {
      throw new Error("Invalid GitHub URL format");
    }

    const { owner, repo } = githubInfo;
    logger.info({ owner, repo }, `Parsed GitHub URL: ${normalizedUrl}`);

    await reporter.completeStage("validation");

    await reporter.updateStage("content_extraction", "processing", 0);

    // Standard browser-based content extraction
    browser = await chromium.launch({
      headless: true,
      args: ['--use-mock-keychain'],
    });
    context = await browser.newContext({ viewport: null });
    const page = await context!.newPage();

    // Navigate to the URL with fallback strategies for slow-loading pages
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
    const thumbnailBuffer = await sharp(ssDesktopBuffer)
      .resize(400, 400, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    allArtifacts.thumbnailStorageId = (
      await objectStorage.saveAsset({
        userId,
        assetType: "bookmarks",
        assetId: bookmarkId,
        fileName: "thumbnail.jpg",
        fileStream: Readable.from(thumbnailBuffer),
        contentType: "image/jpeg",
      })
    ).storageId;

    // Generate screenshot (higher resolution, 1920x1440, 90% quality)
    const screenshotBuffer = await sharp(ssDesktopBuffer)
      .resize(1920, 1440, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    allArtifacts.screenshotDesktopStorageId = (
      await objectStorage.saveAsset({
        userId,
        assetType: "bookmarks",
        assetId: bookmarkId,
        fileName: "screenshot.jpg",
        fileStream: Readable.from(screenshotBuffer),
        contentType: "image/jpeg",
      })
    ).storageId;

    const ssFullPageBuffer = await page.screenshot({
      type: "png",
      fullPage: true,
    });
    allArtifacts.screenshotFullPageStorageId = (
      await objectStorage.saveAsset({
        userId,
        assetType: "bookmarks",
        assetId: bookmarkId,
        fileName: "screenshot-fullpage.png",
        fileStream: Readable.from(ssFullPageBuffer),
        contentType: "image/png",
      })
    ).storageId;

    await page.setViewportSize({ width: 375, height: 667 });
    const ssMobileBuffer = await page.screenshot({ type: "png" });
    allArtifacts.screenshotMobileStorageId = (
      await objectStorage.saveAsset({
        userId,
        assetType: "bookmarks",
        assetId: bookmarkId,
        fileName: "screenshot-mobile.png",
        fileStream: Readable.from(ssMobileBuffer),
        contentType: "image/png",
      })
    ).storageId;

    // Reset viewport for PDF generation
    await page.setViewportSize({ width: 1920, height: 1080 });

    const pdfBuffer = await generateOptimizedPdf(page, bookmarkId);
    allArtifacts.pdfStorageId = (
      await objectStorage.saveAsset({
        userId,
        assetType: "bookmarks",
        assetId: bookmarkId,
        fileName: "content.pdf",
        fileStream: Readable.from(pdfBuffer),
        contentType: "application/pdf",
      })
    ).storageId;

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
        allArtifacts.readmeStorageId = (
          await objectStorage.saveAsset({
            userId,
            assetType: "bookmarks",
            assetId: bookmarkId,
            fileName: "readme.md",
            fileStream: Readable.from(Buffer.from(repoInfo.readmeContent)),
            contentType: "text/markdown",
          })
        ).storageId;

        // Include README content in extracted text for better AI processing
        allArtifacts.extractedText =
          (allArtifacts.extractedText || "") + "\n\n" + repoInfo.readmeContent;
      }
    }

    await reporter.completeStage("content_extraction");

    await reporter.updateStage("ai_tagging", "processing", 0);

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

    await reporter.completeStage("ai_tagging");

    // Keep extractedText in artifacts for database storage, but limit its size to avoid issues
    const finalArtifacts = {
      ...allArtifacts,
      extractedText: allArtifacts.extractedText?.substring(0, 512000) || null, // Limit to 512KB for GitHub repos
    };

    await reporter.completeJob(finalArtifacts);
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

  async processBookmark(
    job: Job<BookmarkJobData>,
    reporter: ProcessingReporter,
  ): Promise<void> {
    return processGitHubBookmark(job, reporter);
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
