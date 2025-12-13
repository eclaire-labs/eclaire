import { type ThrottlingOptions, throttling } from "@octokit/plugin-throttling";
import { Octokit } from "@octokit/rest";
import { createChildLogger } from "../../lib/logger.js";

const logger = createChildLogger("github-api");

// GitHub API configuration
const GITHUB_API_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_GENERAL_DELAY_MS = 1000;

// Log authentication status
if (GITHUB_API_TOKEN) {
  logger.info("GitHub API token found - using authenticated requests");
} else {
  logger.warn(
    "No GitHub API token found - using unauthenticated requests (limited to ~60 requests/hour)",
  );
}

// Types
export interface GitHubRepoInfo {
  name: string;
  owner: string;
  description: string | null;
  stars: number;
  forks: number;
  watchers: number;
  language: string | null;
  topics: string[];
  license: string | null;
  lastCommitDate: string | null;
  latestRelease: {
    version: string;
    date: string;
  } | null;
  html_url: string;
  readmeContent: string | null;
  created_at: string;
  updated_at: string;
  repositoryData: any; // Full API response for storage in rawMetadata
}

// Initialize GitHub API client with throttling
const ThrottledOctokit = Octokit.plugin(throttling);
const octokit = new ThrottledOctokit({
  auth: GITHUB_API_TOKEN || undefined, // Use undefined for unauthenticated requests
  throttle: {
    onRateLimit: (
      retryAfter: number,
      options: any,
      octokitInstance: any,
      retryCount: number,
    ) => {
      const authStatus = GITHUB_API_TOKEN ? "authenticated" : "unauthenticated";
      logger.warn(
        `GitHub API rate limit hit (${authStatus}) for ${options.method} ${options.url}. Retrying after ${retryAfter}s. Retry count: ${retryCount}`,
      );
      if (retryCount < 3) return true;
      return false;
    },
    onSecondaryRateLimit: (
      retryAfter: number,
      options: any,
      octokitInstance: any,
    ) => {
      const authStatus = GITHUB_API_TOKEN ? "authenticated" : "unauthenticated";
      logger.warn(
        `GitHub API secondary rate limit hit (${authStatus}) for ${options.method} ${options.url}. Retrying after ${retryAfter}s.`,
      );
      return true;
    },
  } as ThrottlingOptions,
});

/**
 * Extract owner and repo from GitHub URL
 */
export function parseGitHubUrl(
  url: string,
): { owner: string; repo: string } | null {
  try {
    const urlParts = url
      .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
      .split("/");
    if (urlParts.length < 2) {
      return null;
    }

    const owner = urlParts[0];
    const repo = urlParts[1]?.split("?")[0]?.split("#")[0];

    if (!owner || !repo) {
      return null;
    }

    return { owner, repo };
  } catch (error) {
    logger.warn({ url, error }, "Failed to parse GitHub URL");
    return null;
  }
}

/**
 * Check if URL is a GitHub repository URL
 */
export function isGitHubUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "github.com" || hostname === "www.github.com";
  } catch (error) {
    return false;
  }
}

/**
 * Fetch comprehensive GitHub repository information
 */
export async function fetchGitHubRepoInfo(
  owner: string,
  repo: string,
): Promise<{ repoInfo: GitHubRepoInfo | null; error?: string }> {
  const authStatus = GITHUB_API_TOKEN ? "authenticated" : "unauthenticated";
  logger.info(`Fetching GitHub API data for ${owner}/${repo} (${authStatus})`);

  try {
    // Fetch repository data
    const reposResponse = await octokit.repos.get({ owner, repo });

    if (!reposResponse.data) {
      const error = "Empty response from GitHub API";
      logger.warn({ owner, repo }, error);
      return { repoInfo: null, error };
    }

    const repoData = reposResponse.data;
    logger.debug(
      {
        owner,
        repo,
        stars: repoData.stargazers_count,
        language: repoData.language,
      },
      "Repository data fetched successfully",
    );

    // Fetch last commit date
    let lastCommitDate: string | null = null;
    try {
      const commitsResponse = await octokit.repos.listCommits({
        owner,
        repo,
        per_page: 1,
      });

      if (commitsResponse.data.length > 0) {
        lastCommitDate =
          commitsResponse.data[0]?.commit?.committer?.date || null;
        logger.debug(
          { owner, repo, lastCommitDate },
          "Last commit date fetched",
        );
      }
    } catch (commitError: any) {
      logger.warn(
        { owner, repo, error: commitError.message },
        `Could not fetch commit data for ${owner}/${repo}`,
      );
    }

    // Fetch latest release
    let latestRelease: { version: string; date: string } | null = null;
    try {
      const releasesResponse = await octokit.repos.getLatestRelease({
        owner,
        repo,
      });

      if (releasesResponse.data) {
        latestRelease = {
          version: releasesResponse.data.tag_name,
          date:
            releasesResponse.data.published_at ||
            releasesResponse.data.created_at,
        };
        logger.debug(
          { owner, repo, version: latestRelease.version },
          "Latest release fetched",
        );
      }
    } catch (releaseError: any) {
      if (releaseError.status === 404) {
        logger.debug({ owner, repo }, "No releases found for repository");
      } else {
        logger.warn(
          { owner, repo, error: releaseError.message },
          `Could not fetch release data for ${owner}/${repo}`,
        );
      }
    }

    // Fetch README content
    let readmeContent: string | null = null;
    try {
      const readmeResponse = await octokit.repos.getReadme({ owner, repo });

      if (
        readmeResponse.data &&
        "content" in readmeResponse.data &&
        typeof readmeResponse.data.content === "string"
      ) {
        readmeContent = Buffer.from(
          readmeResponse.data.content,
          "base64",
        ).toString("utf-8");
        logger.debug(
          { owner, repo, readmeLength: readmeContent.length },
          "README content fetched",
        );
      }
    } catch (readmeError: any) {
      if (readmeError.status === 404) {
        logger.debug({ owner, repo }, "No README found for repository");
      } else {
        logger.warn(
          { owner, repo, error: readmeError.message },
          `Could not fetch README for ${owner}/${repo}`,
        );
      }
    }

    // Construct repository information
    const repoInfo: GitHubRepoInfo = {
      name: repoData.name,
      owner: repoData.owner.login,
      description: repoData.description,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      watchers: repoData.watchers_count,
      language: repoData.language,
      topics: repoData.topics || [],
      license: repoData.license?.name || null,
      lastCommitDate,
      latestRelease,
      html_url: repoData.html_url,
      readmeContent,
      created_at: repoData.created_at,
      updated_at: repoData.updated_at,
      repositoryData: repoData, // Store full API response
    };

    logger.info(
      {
        owner,
        repo,
        stars: repoInfo.stars,
        language: repoInfo.language,
        hasReadme: !!repoInfo.readmeContent,
        hasRelease: !!repoInfo.latestRelease,
      },
      `Successfully fetched GitHub data for ${owner}/${repo}`,
    );
    return { repoInfo };
  } catch (error: any) {
    const errorMessage = `Error fetching GitHub API data for ${owner}/${repo}: ${error.message}`;

    // Log different error types appropriately
    if (error.status === 404) {
      logger.warn(
        { owner, repo },
        `Repository ${owner}/${repo} not found or not accessible`,
      );
    } else if (error.status === 403) {
      logger.warn(
        { owner, repo },
        `Access denied to ${owner}/${repo} - check authentication or repository visibility`,
      );
    } else if (error.status === 401) {
      logger.warn(
        { owner, repo },
        `Authentication failed for GitHub API - check GITHUB_TOKEN`,
      );
    } else {
      logger.error(
        { owner, repo, error: error.message, status: error.status },
        errorMessage,
      );
    }

    return {
      repoInfo: null,
      error: errorMessage,
    };
  }
}

/**
 * Generate enhanced tags for GitHub repositories
 */
export function generateGitHubTags(repoInfo: GitHubRepoInfo): string[] {
  const tags: string[] = [];

  // Add programming language as tag
  if (repoInfo.language) {
    tags.push(repoInfo.language.toLowerCase());
  }

  // Add repository topics
  if (repoInfo.topics && repoInfo.topics.length > 0) {
    tags.push(...repoInfo.topics.map((topic) => topic.toLowerCase()));
  }

  // Add license type if available
  if (repoInfo.license) {
    tags.push(`license-${repoInfo.license.toLowerCase().replace(/\s+/g, "-")}`);
  }

  // Add star-based popularity tags
  if (repoInfo.stars >= 10000) {
    tags.push("popular");
  } else if (repoInfo.stars >= 1000) {
    tags.push("trending");
  }

  // Add 'github' tag to identify source
  tags.push("github");

  // Remove duplicates and limit to reasonable number
  const uniqueTags = Array.from(new Set(tags));
  return uniqueTags.slice(0, 10);
}

/**
 * Add delay between GitHub API requests to respect rate limits
 */
export async function addGitHubDelay(): Promise<void> {
  if (GITHUB_GENERAL_DELAY_MS > 0) {
    logger.debug(
      `Adding ${GITHUB_GENERAL_DELAY_MS}ms delay for GitHub API rate limiting`,
    );
    await new Promise((resolve) =>
      setTimeout(resolve, GITHUB_GENERAL_DELAY_MS),
    );
  }
}
