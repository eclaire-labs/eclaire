import { createChildLogger } from "../../lib/logger.js";
import type { RedditMediaInfo, RedditSubredditInfo } from "./reddit-api-client.js";
import type {
  RedditCommentData,
  RedditExtractedData,
  RedditPostData,
} from "./reddit-extractor.js";

const logger = createChildLogger("reddit-renderer");

/**
 * Generate HTML for Reddit post without comments (for thumbnails and screenshots)
 */
export function generateRedditHTMLNoComments(
  data: RedditExtractedData,
): string {
  logger.info(
    { postId: data.mainPost.id },
    "Generating Reddit HTML without comments",
  );

  const { mainPost, subreddit } = data;

  return generateHTML(mainPost, subreddit, [], false);
}

/**
 * Generate HTML for Reddit post with all comments (for full content and PDFs)
 */
export function generateRedditHTMLWithComments(
  data: RedditExtractedData,
): string {
  logger.info(
    { postId: data.mainPost.id, commentCount: data.stats.totalComments },
    "Generating Reddit HTML with comments",
  );

  const { mainPost, subreddit, comments } = data;

  return generateHTML(mainPost, subreddit, comments, true);
}

/**
 * Core HTML generation function
 */
function generateHTML(
  post: RedditPostData,
  subreddit: RedditSubredditInfo | null,
  comments: RedditCommentData[],
  includeComments: boolean,
): string {
  const formatTime = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const formatScore = (score: number): string => {
    if (score >= 1000) {
      return (score / 1000).toFixed(1) + "k";
    }
    return score.toString();
  };

  const getUserAvatarColor = (username: string): string => {
    // Generate consistent color based on username hash
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Convert to HSL for better color distribution
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  };

  const renderMedia = (media: RedditMediaInfo): string => {
    if (!media || media.type === "none") return "";

    switch (media.type) {
      case "image":
        return `<div class="post-media"><img src="${media.url}" alt="Post image" loading="lazy"></div>`;

      case "reddit_video":
        return `
          <div class="post-media">
            <video controls preload="metadata" poster="${media.thumbnail || ""}">
              <source src="${media.url}" type="video/mp4">
              Your browser does not support the video tag.
            </video>
          </div>`;

      case "gallery": {
        if (!media.items || media.items.length === 0) return "";
        const images = media.items
          .map(
            (item, index) =>
              `<div class="gallery-item">
            <img src="${item.url}" alt="Gallery image ${index + 1}" loading="lazy">
            ${item.caption ? `<div class="gallery-caption">${item.caption}</div>` : ""}
          </div>`,
          )
          .join("");
        return `<div class="post-media gallery">${images}</div>`;
      }

      case "embed":
        if (media.html) {
          return `<div class="post-media embed">${media.html}</div>`;
        } else if (media.thumbnail_url) {
          return `<div class="post-media embed-thumbnail">
            <img src="${media.thumbnail_url}" alt="${media.title || "Embedded content"}">
            <div class="embed-info">
              <span class="embed-provider">${media.provider}</span>
              ${media.title ? `<span class="embed-title">${media.title}</span>` : ""}
            </div>
          </div>`;
        }
        break;

      case "link":
        return `<div class="post-media external-link">
          <a href="${media.url}" target="_blank" rel="noopener">
            ${media.preview ? `<img src="${media.preview.url}" alt="Link preview">` : ""}
            <div class="link-info">
              <span class="link-domain">${media.domain}</span>
              <span class="link-url">${media.url}</span>
            </div>
          </a>
        </div>`;
    }
    return "";
  };

  const renderComment = (comment: RedditCommentData): string => {
    const replies = comment.replies
      .map((reply) => renderComment(reply))
      .join("");
    const indent = comment.depth * 20;
    const avatarColor = getUserAvatarColor(comment.author);
    const isOP = comment.author === post.author;

    return `
      <div class="comment" style="margin-left: ${indent}px;">
        <div class="comment-header">
          <div class="user-avatar" style="background-color: ${avatarColor}">
            ${comment.author.charAt(0).toUpperCase()}
          </div>
          <div class="comment-meta">
            <span class="author">u/${comment.author}</span>
            ${isOP ? '<span class="op-badge">OP</span>' : ""}
            <span class="score">${formatScore(comment.score)} points</span>
            <span class="time">${formatTime(comment.created_utc)}</span>
          </div>
        </div>
        <div class="comment-body">${comment.body_html || comment.body.replace(/\n/g, "<br>")}</div>
        ${replies}
      </div>
    `;
  };

  const commentsHTML = includeComments
    ? comments.map((comment) => renderComment(comment)).join("")
    : "";

  // Subreddit header
  const subredditHeader = subreddit
    ? `
    <div class="subreddit-header">
      ${subreddit.icon_img ? `<img src="${subreddit.icon_img}" alt="r/${subreddit.display_name}" class="subreddit-icon">` : '<div class="subreddit-icon-placeholder">r/</div>'}
      <div class="subreddit-info">
        <div class="subreddit-name">${subreddit.display_name_prefixed}</div>
        <div class="subreddit-desc">${subreddit.public_description || subreddit.title}</div>
      </div>
    </div>
  `
    : `
    <div class="subreddit-header">
      <div class="subreddit-icon-placeholder">r/</div>
      <div class="subreddit-info">
        <div class="subreddit-name">r/${post.subreddit}</div>
      </div>
    </div>
  `;

  const commentsSection = includeComments
    ? `
    <div class="comments-section">
      <div class="comments-header">
        Comments
      </div>
      
      <div class="comments">
        ${commentsHTML || '<div class="comment"><p>No comments yet.</p></div>'}
      </div>
    </div>
  `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.title} - r/${post.subreddit}</title>
  <style>
    :root {
      --bg-color: #ffffff;
      --text-color: #1c1c1c;
      --border-color: #ccc;
      --meta-color: #7c7c7c;
      --link-color: #0066cc;
      --hover-bg: #f5f5f5;
      --subreddit-bg: #f8f9fa;
      --vote-color: #878a8c;
      --upvote-color: #ff4500;
    }

    [data-theme="dark"] {
      --bg-color: #1a1a1b;
      --text-color: #d7dadc;
      --border-color: #343536;
      --meta-color: #818384;
      --link-color: #4fbcff;
      --hover-bg: #272729;
      --subreddit-bg: #272729;
      --vote-color: #818384;
      --upvote-color: #ff4500;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.4;
      margin: 0;
      padding: 0;
      background-color: var(--bg-color);
      color: var(--text-color);
      transition: background-color 0.3s, color 0.3s;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      background: var(--bg-color);
      min-height: 100vh;
    }

    .theme-toggle {
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--hover-bg);
      border: 1px solid var(--border-color);
      color: var(--text-color);
      padding: 8px 12px;
      border-radius: 20px;
      cursor: pointer;
      z-index: 1000;
      font-size: 14px;
    }

    .subreddit-header {
      display: flex;
      align-items: center;
      padding: 16px 20px;
      background: var(--subreddit-bg);
      border-bottom: 1px solid var(--border-color);
    }

    .subreddit-icon, .subreddit-icon-placeholder {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      margin-right: 12px;
      flex-shrink: 0;
    }

    .subreddit-icon-placeholder {
      background: var(--upvote-color);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 12px;
    }

    .subreddit-name {
      font-weight: 600;
      font-size: 16px;
      color: var(--text-color);
    }

    .subreddit-desc {
      font-size: 12px;
      color: var(--meta-color);
      margin-top: 2px;
    }

    .post {
      padding: 20px;
      border-bottom: 1px solid var(--border-color);
    }

    .post-header {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }

    .post-meta {
      color: var(--meta-color);
      font-size: 12px;
    }

    .post-meta span {
      margin-right: 8px;
    }

    .author {
      font-weight: 500;
      color: var(--text-color);
    }

    .post-title {
      font-size: 20px;
      font-weight: 500;
      margin: 12px 0;
      color: var(--text-color);
      line-height: 1.3;
    }

    .post-content {
      margin: 16px 0;
      line-height: 1.5;
    }

    .post-media {
      margin: 16px 0;
    }

    .post-media img, .post-media video {
      max-width: 100%;
      width: 100%;
      height: auto;
      border-radius: 4px;
      min-height: 200px;
      object-fit: contain;
      background: var(--hover-bg);
    }

    .gallery {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    }

    .gallery-item {
      position: relative;
    }

    .gallery-caption {
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 4px 8px;
      font-size: 12px;
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
    }

    .external-link {
      border: 1px solid var(--border-color);
      border-radius: 4px;
      overflow: hidden;
    }

    .external-link a {
      display: block;
      text-decoration: none;
      color: inherit;
    }

    .external-link img {
      width: 100%;
      height: 200px;
      object-fit: cover;
    }

    .link-info {
      padding: 12px;
    }

    .link-domain {
      font-size: 12px;
      color: var(--meta-color);
      display: block;
    }

    .link-url {
      font-size: 14px;
      color: var(--link-color);
      word-break: break-all;
    }

    .embed-thumbnail {
      border: 1px solid var(--border-color);
      border-radius: 4px;
      overflow: hidden;
      max-width: 500px;
    }

    .embed-info {
      padding: 12px;
    }

    .embed-provider {
      font-size: 12px;
      color: var(--meta-color);
      display: block;
    }

    .embed-title {
      font-size: 14px;
      color: var(--text-color);
      font-weight: 500;
    }

    .post-actions {
      display: flex;
      align-items: center;
      margin-top: 16px;
      color: var(--vote-color);
      font-size: 12px;
      font-weight: 600;
    }

    .post-actions span {
      margin-right: 16px;
    }

    .post-score {
      color: var(--upvote-color);
    }

    .comments-section {
      background: var(--bg-color);
    }

    .comments-header {
      font-size: 16px;
      font-weight: 600;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
      background: var(--subreddit-bg);
    }

    .comment {
      position: relative;
      padding: 12px 20px;
      margin-bottom: 1px;
    }

    .comment::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 2px;
      background: transparent;
      transition: background-color 0.2s;
    }

    .comment:hover::before {
      background: var(--border-color);
    }

    .comment-header {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }

    .user-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 11px;
      margin-right: 8px;
      flex-shrink: 0;
    }

    .comment-meta {
      font-size: 12px;
      color: var(--meta-color);
      margin-bottom: 8px;
    }

    .comment-meta span {
      margin-right: 8px;
    }

    .op-badge {
      background: var(--link-color);
      color: white;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: bold;
      text-transform: uppercase;
    }

    .comment-body {
      line-height: 1.5;
    }

    .comment-body p {
      margin: 8px 0;
    }

    .comment-body blockquote {
      border-left: 3px solid var(--border-color);
      padding-left: 16px;
      margin: 12px 0;
      color: var(--meta-color);
    }

    .comment-body pre {
      background: var(--hover-bg);
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 13px;
    }

    .comment-body code {
      background: var(--hover-bg);
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 13px;
    }

    a {
      color: var(--link-color);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    @media (max-width: 600px) {
      .container {
        margin: 0;
      }
      
      .subreddit-header {
        padding: 12px 16px;
      }
      
      .post {
        padding: 16px;
      }
      
      .comment {
        padding: 12px 16px;
      }
      
      .comment-header {
        flex-wrap: wrap;
      }
      
      .user-avatar {
        width: 20px;
        height: 20px;
        font-size: 10px;
      }
      
      .comment[style*="margin-left"] {
        margin-left: 0 !important;
        padding-left: calc(16px + var(--depth, 0) * 12px);
      }
    }
  </style>
</head>
<body>
  <button class="theme-toggle" onclick="toggleTheme()">🌓 Toggle Theme</button>
  
  <div class="container">
    ${subredditHeader}

    <div class="post">
      <div class="post-header">
        <div class="post-meta">
          <span class="author">Posted by u/${post.author}</span>
          <span class="time">${formatTime(post.created_utc)}</span>
          ${post.domain && !post.is_self ? `<span class="domain">${post.domain}</span>` : ""}
        </div>
      </div>
      
      <h1 class="post-title">${post.title}</h1>
      
      ${post.selftext_html ? `<div class="post-content">${post.selftext_html}</div>` : ""}
      
      ${renderMedia(post.media)}
      
      <div class="post-actions">
        <span class="post-score">${formatScore(post.score)} points</span>
        <span>${(post.upvote_ratio * 100).toFixed(0)}% upvoted</span>
        <span>${post.num_comments} comments</span>
      </div>
    </div>

    ${commentsSection}
  </div>

  <script>
    function toggleTheme() {
      const html = document.documentElement;
      const currentTheme = html.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
    }

    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Add depth CSS variables for mobile responsiveness
    document.querySelectorAll('.comment').forEach(comment => {
      const style = comment.getAttribute('style');
      if (style && style.includes('margin-left')) {
        const marginMatch = style.match(/margin-left:\\s*(\\d+)px/);
        if (marginMatch) {
          const depth = Math.floor(parseInt(marginMatch[1]) / 20);
          comment.style.setProperty('--depth', depth);
        }
      }
    });
  </script>
</body>
</html>`;
}
