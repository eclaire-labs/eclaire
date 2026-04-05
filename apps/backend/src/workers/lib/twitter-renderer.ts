import { createChildLogger } from "../../lib/logger.js";
import type {
  TwitterExtractedData,
  TwitterTweet,
} from "./twitter-extractor.js";

const logger = createChildLogger("twitter-renderer");

// CSS styles for the Twitter/X-like interface
const CSS_STYLES = `
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}
:root {
    --bg-primary: #ffffff; --bg-secondary: #f7f9fa; --text-primary: #0f1419;
    --text-secondary: #536471; --border-color: #eff3f4; --accent-blue: #1d9bf0;
    --accent-hover: #1a8cd8; --shadow: 0 1px 3px rgba(0,0,0,0.1);
}
[data-theme="dark"] {
    --bg-primary: #000000; --bg-secondary: #16181c; --text-primary: #e7e9ea;
    --text-secondary: #71767b; --border-color: #2f3336; --shadow: 0 1px 3px rgba(255,255,255,0.1);
}
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background-color: var(--bg-secondary); color: var(--text-primary);
    transition: all 0.3s ease; min-height: 100vh; padding: 20px;
}
.container { max-width: 600px; width: 100%; margin: 0 auto; }
.header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 20px; padding-bottom: 10px;
}
.theme-toggle {
    background: var(--bg-primary); border: 1px solid var(--border-color);
    color: var(--text-primary); padding: 8px 16px; border-radius: 20px;
    cursor: pointer; transition: all 0.3s ease;
}
.theme-toggle:hover { background: var(--border-color); }
.tweet-container {
    background: var(--bg-primary); border: 1px solid var(--border-color);
    box-shadow: var(--shadow); border-radius: 16px; overflow: hidden;
}
.tweet-header { display: flex; align-items: center; padding: 16px; gap: 12px; }
.avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
.user-info { flex: 1; }
.user-name { font-weight: bold; color: var(--text-primary); display: flex; align-items: center; gap: 4px; }
.verified { color: var(--accent-blue); font-size: 18px; }
.username { color: var(--text-secondary); font-size: 15px; }
.x-logo { width: 20px; height: 20px; fill: var(--text-primary); }
.tweet-content { padding: 0 16px 16px; }
.tweet-text { font-size: 20px; line-height: 1.4; color: var(--text-primary); margin-bottom: 16px; white-space: pre-wrap; word-wrap: break-word; }
.tweet-text a { color: var(--accent-blue); text-decoration: none; }
.tweet-text a:hover { text-decoration: underline; }
.tweet-media { border-radius: 12px; overflow: hidden; margin-top: 12px; border: 1px solid var(--border-color); }
.media-container { display: grid; gap: 2px; }
.media-container.single { grid-template-columns: 1fr; }
.media-container.multiple { grid-template-columns: 1fr 1fr; }
.media-item { width: 100%; height: 300px; object-fit: cover; cursor: pointer; transition: opacity 0.3s ease; }
.media-item:hover { opacity: 0.9; }
.tweet-footer { padding: 12px 16px; border-top: 1px solid var(--border-color); }
.tweet-date { color: var(--text-secondary); font-size: 15px; margin-bottom: 12px; }
.tweet-stats { display: flex; gap: 24px; flex-wrap: wrap; }
.stat-item { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 14px; }
.referenced-tweet { margin: 12px 16px; padding: 12px; border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-secondary); }
.referenced-tweet .ref-label { font-size: 13px; color: var(--text-secondary); margin-bottom: 4px; }
@media (max-width: 640px) {
    .tweet-stats { gap: 15px; } .stat-item { font-size: 12px; }
    .media-container.multiple { grid-template-columns: 1fr; }
}`;

// JavaScript for theme toggle
const JAVASCRIPT = `
let currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    const toggleBtn = document.querySelector('.theme-toggle');
    if (toggleBtn) toggleBtn.textContent = currentTheme === 'light' ? 'Dark Mode' : 'Light Mode';
}
document.addEventListener('click', e => {
    if (e.target.classList.contains('media-item')) window.open(e.target.src, '_blank');
});
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.querySelector('.theme-toggle');
    if (toggleBtn) toggleBtn.textContent = currentTheme === 'light' ? 'Dark Mode' : 'Light Mode';
});
`;

/**
 * Format large numbers with K/M suffixes.
 */
function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Format an ISO 8601 date string for display.
 */
function formatDate(dateString: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Format tweet text with clickable links using v2 entity indices.
 * Replaces t.co URLs with their expanded versions and filters out
 * trailing media URLs.
 */
function formatTweetText(tweet: TwitterTweet): string {
  let text = tweet.text || "";
  if (!text) return "";

  // Escape HTML first, then replace links
  text = escapeHtml(text);

  // Replace t.co links from the links array (process in reverse order to preserve indices)
  const sortedLinks = [...tweet.links].sort((a, b) => b.start - a.start);
  for (const link of sortedLinks) {
    const escapedUrl = escapeHtml(link.url);
    const escapedExpandedUrl = escapeHtml(link.expandedUrl);
    const escapedDisplayUrl = escapeHtml(link.displayUrl);
    const anchorTag = `<a href="${escapedExpandedUrl}" target="_blank" rel="noopener noreferrer">${escapedDisplayUrl}</a>`;
    text = text.replace(escapedUrl, anchorTag);
  }

  // Remove trailing t.co links that correspond to media
  if (tweet.media.length > 0) {
    text = text.replace(/\s*https:\/\/t\.co\/\w+\s*$/, "");
  }

  return text.trim();
}

/**
 * Get the verification badge HTML based on verified_type.
 */
function getVerifiedBadge(verifiedType: string | null): string {
  if (!verifiedType) return "";
  // All verified types get a checkmark, color varies
  const colorMap: Record<string, string> = {
    blue: "#1d9bf0",
    business: "#e8b631",
    government: "#829aab",
  };
  const color = colorMap[verifiedType] || "#1d9bf0";
  return `<span class="verified" style="color: ${color}">&#x2713;</span>`;
}

/**
 * Generate the complete HTML for a tweet.
 */
function generateTweetHTML(data: TwitterExtractedData): string {
  const { mainTweet } = data;

  const mediaHtml =
    mainTweet.media.length > 0
      ? `
        <div class="tweet-media">
            <div class="media-container ${mainTweet.media.length === 1 ? "single" : "multiple"}">
                ${mainTweet.media
                  .map((m) => {
                    const imgUrl =
                      m.type === "video" || m.type === "animated_gif"
                        ? m.previewImageUrl || m.url
                        : m.url;
                    return `<img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(m.altText)}" class="media-item">`;
                  })
                  .join("")}
            </div>
        </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(mainTweet.author.name)} (@${escapeHtml(mainTweet.author.username)}) on X</title>
    <style>${CSS_STYLES}</style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Post on X</h2>
            <button class="theme-toggle" onclick="toggleTheme()">Dark Mode</button>
        </div>
        <div class="tweet-container">
            <div class="tweet-header">
                <img src="${escapeHtml(mainTweet.author.profileImageUrl)}" alt="${escapeHtml(mainTweet.author.name)}" class="avatar">
                <div class="user-info">
                    <div class="user-name">
                        ${escapeHtml(mainTweet.author.name)}
                        ${getVerifiedBadge(mainTweet.author.verifiedType)}
                    </div>
                    <div class="username">@${escapeHtml(mainTweet.author.username)}</div>
                </div>
                <svg class="x-logo" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </div>
            <div class="tweet-content">
                <div class="tweet-text">${formatTweetText(mainTweet)}</div>
                ${mediaHtml}
            </div>
            <div class="tweet-footer">
                <div>
                    <div class="tweet-date">${formatDate(mainTweet.createdAt)}</div>
                    <div class="tweet-stats">
                        <div class="stat-item"><span>&#x1F4AC;</span><span>${formatNumber(mainTweet.stats.replies)}</span></div>
                        <div class="stat-item"><span>&#x1F504;</span><span>${formatNumber(mainTweet.stats.retweets)}</span></div>
                        <div class="stat-item"><span>&#x2764;&#xFE0F;</span><span>${formatNumber(mainTweet.stats.likes)}</span></div>
                        <div class="stat-item"><span>&#x1F516;</span><span>${formatNumber(mainTweet.stats.bookmarks)}</span></div>
                        ${mainTweet.stats.impressions ? `<div class="stat-item"><span>&#x1F441;&#xFE0F;</span><span>${formatNumber(mainTweet.stats.impressions)}</span></div>` : ""}
                    </div>
                </div>
            </div>
        </div>
    </div>
    <script>${JAVASCRIPT}</script>
</body>
</html>`;
}

/**
 * Generate HTML without replies (for thumbnails and screenshots).
 */
export function generateTwitterHTMLNoReplies(
  data: TwitterExtractedData,
): string {
  const html = generateTweetHTML(data);

  logger.debug(
    {
      tweetId: data.mainTweet.id,
      author: data.mainTweet.author.username,
    },
    "Generated Twitter HTML (no replies)",
  );

  return html;
}

/**
 * Generate HTML with replies (for full content extraction).
 * Currently identical to no-replies since v2 single-tweet lookup
 * doesn't include conversation replies. Structure is ready for
 * future conversation thread support.
 */
export function generateTwitterHTMLWithReplies(
  data: TwitterExtractedData,
): string {
  return generateTweetHTML(data);
}
