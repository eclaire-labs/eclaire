import type { JobContext } from "@eclaire/queue/core";
import { createChildLogger } from "../../../lib/logger.js";
import { buildKey, getStorage } from "../../../lib/storage/index.js";
import {
  fetchGitHubRepoInfo,
  generateGitHubTags,
  isGitHubUrl,
  parseGitHubUrl,
} from "../github-api.js";
import { BrowserPipeline } from "./browser-pipeline.js";
import type {
  BookmarkHandler,
  BookmarkHandlerType,
  BookmarkJobData,
} from "./index.js";
import { normalizeUrl } from "./index.js";
import { extractContentFromHtml, generateBookmarkTags } from "./utils.js";

const logger = createChildLogger("github-bookmark-handler");

/**
 * GitHub specific bookmark processing handler using BrowserPipeline.
 */
export async function processGitHubBookmark(
  ctx: JobContext<BookmarkJobData>,
): Promise<void> {
  const { bookmarkId, url: originalUrl, userId } = ctx.job.data;
  logger.info({ bookmarkId, userId }, "Processing with GITHUB handler");

  // biome-ignore lint/suspicious/noExplicitAny: dynamic artifact accumulator populated across processing stages
  const allArtifacts: Record<string, any> = {};

  const pipeline = new BrowserPipeline({ bookmarkId, userId, logger });

  try {
    const normalizedUrl = normalizeUrl(originalUrl);
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

    // Browser-based content extraction via pipeline
    await pipeline.launch();
    const navResult = await pipeline.navigateTo(normalizedUrl);
    allArtifacts.contentType = navResult.contentType;
    allArtifacts.etag = navResult.etag;
    allArtifacts.lastModified = navResult.lastModified;

    // Screenshots and PDF via pipeline (hardened with timeouts and error boundaries)
    const screenshotArtifacts = await pipeline.captureAllScreenshots();
    Object.assign(allArtifacts, screenshotArtifacts);

    const pdfArtifacts = await pipeline.capturePdf();
    Object.assign(allArtifacts, pdfArtifacts);

    // Extract HTML content
    const rawHtml = await pipeline.getPageContent();
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
    } else {
      allArtifacts.title = repoInfo.name || allArtifacts.title;
      allArtifacts.description =
        repoInfo.description || allArtifacts.description;
      allArtifacts.author = repoInfo.owner;

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
        const storage = getStorage();
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

        allArtifacts.extractedText = `${allArtifacts.extractedText || ""}\n\n${repoInfo.readmeContent}`;
      }
    }

    await ctx.completeStage("content_extraction");

    await ctx.startStage("ai_tagging");

    // Generate GitHub-specific tags
    let githubTags: string[] = [];
    if (repoInfo) {
      githubTags = generateGitHubTags(repoInfo);
    }

    const aiTags = await generateBookmarkTags(
      allArtifacts.extractedText,
      allArtifacts.title || "",
      false,
    );

    allArtifacts.tags = Array.from(new Set([...githubTags, ...aiTags]));

    const { extractedText: _excludeText, ...finalArtifacts } = allArtifacts;
    await ctx.completeStage("ai_tagging", finalArtifacts);
  } finally {
    await pipeline.cleanup();
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
