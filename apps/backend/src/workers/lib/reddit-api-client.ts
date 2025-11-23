import https from "https";
import { createChildLogger } from "../../lib/logger";

const logger = createChildLogger("reddit-api-client");

export interface RedditClientOptions {
  maxMoreCalls?: number;
  maxCommentsPerCall?: number;
  maxDepth?: number;
  prioritizeShallow?: boolean;
  fetchSubredditInfo?: boolean;
}

export interface RedditAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface RedditSubredditInfo {
  display_name: string;
  display_name_prefixed: string;
  title: string;
  public_description: string;
  icon_img: string | null;
  header_img: string | null;
  subscribers: number;
  created_utc: number;
}

export interface RedditMediaInfo {
  type: "none" | "image" | "reddit_video" | "gallery" | "embed" | "link";
  url?: string;
  thumbnail?: string;
  preview?: {
    url: string;
    width: number;
    height: number;
  };
  // Video-specific
  audio_url?: string;
  width?: number;
  height?: number;
  duration?: number;
  // Gallery-specific
  items?: Array<{
    url: string;
    width: number;
    height: number;
    caption?: string;
  }>;
  // Embed-specific
  provider?: string;
  title?: string;
  html?: string;
  thumbnail_url?: string;
  // Link-specific
  domain?: string;
}

export interface RedditApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export class RedditApiClient {
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private userAgent = "Eclaire/1.0.0";

  // Configurable limits to control API usage
  private maxMoreCalls: number;
  private maxCommentsPerCall: number;
  private maxDepth: number;
  private prioritizeShallow: boolean;
  private fetchSubredditData: boolean;

  constructor(options: RedditClientOptions = {}) {
    this.clientId = process.env.REDDIT_CLIENT_ID || "";
    this.clientSecret = process.env.REDDIT_CLIENT_SECRET || "";

    // Use conservative defaults, especially maxMoreCalls: 3 as requested
    this.maxMoreCalls = options.maxMoreCalls || 3;
    this.maxCommentsPerCall = options.maxCommentsPerCall || 100;
    this.maxDepth = options.maxDepth || 10;
    this.prioritizeShallow = options.prioritizeShallow !== false;
    this.fetchSubredditData = options.fetchSubredditInfo !== false;

    if (!this.clientId || !this.clientSecret) {
      logger.warn(
        "Reddit API credentials not found. REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET environment variables are required for Reddit API access.",
      );
    }
  }

  /**
   * Check if Reddit API credentials are available
   */
  hasCredentials(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  async authenticate(): Promise<RedditAuthResponse> {
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString(
      "base64",
    );
    const postData = "grant_type=client_credentials";

    const options = {
      hostname: "www.reddit.com",
      path: "/api/v1/access_token",
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "User-Agent": this.userAgent,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": postData.length,
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            if (response.access_token) {
              this.accessToken = response.access_token;
              logger.info("Reddit API authentication successful");
              resolve(response);
            } else {
              reject(new Error("No access token received from Reddit API"));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on("error", reject);
      req.write(postData);
      req.end();
    });
  }

  private async apiRequest(path: string): Promise<any> {
    if (!this.accessToken) {
      await this.authenticate();
    }

    const options = {
      hostname: "oauth.reddit.com",
      path: path,
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "User-Agent": this.userAgent,
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on("error", reject);
      req.end();
    });
  }

  async fetchSubredditInfo(
    subredditName: string,
  ): Promise<RedditSubredditInfo | null> {
    if (!this.fetchSubredditData) return null;

    try {
      logger.info({ subreddit: subredditName }, "Fetching subreddit info");
      const response = await this.apiRequest(`/r/${subredditName}/about`);

      if (response && response.data) {
        return {
          display_name: response.data.display_name,
          display_name_prefixed: response.data.display_name_prefixed,
          title: response.data.title,
          public_description: response.data.public_description,
          icon_img: response.data.icon_img || response.data.community_icon,
          header_img: response.data.header_img,
          subscribers: response.data.subscribers,
          created_utc: response.data.created_utc,
        };
      }
    } catch (error: any) {
      logger.warn(
        { subreddit: subredditName, error: error.message },
        "Could not fetch subreddit info",
      );
    }
    return null;
  }

  extractMediaInfo(postData: any): RedditMediaInfo {
    const media: RedditMediaInfo = {
      type: "none",
      url: undefined,
      thumbnail: postData.thumbnail !== "self" ? postData.thumbnail : undefined,
      preview: undefined,
    };

    // Handle different media types
    if (postData.is_video && postData.media && postData.media.reddit_video) {
      // Reddit hosted video
      media.type = "reddit_video";
      media.url = postData.media.reddit_video.fallback_url;
      media.audio_url = postData.media.reddit_video.fallback_url.replace(
        "DASH_",
        "DASH_audio_",
      );
      media.width = postData.media.reddit_video.width;
      media.height = postData.media.reddit_video.height;
      media.duration = postData.media.reddit_video.duration;
    } else if (
      postData.post_hint === "image" ||
      (postData.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(postData.url))
    ) {
      // Image post
      media.type = "image";
      media.url = postData.url;
    } else if (postData.is_gallery && postData.gallery_data) {
      // Gallery post
      media.type = "gallery";
      media.items = [];

      if (postData.media_metadata) {
        for (const item of postData.gallery_data.items) {
          const mediaId = item.media_id;
          const metadata = postData.media_metadata[mediaId];
          if (metadata && metadata.s) {
            media.items.push({
              url: metadata.s.u?.replace(/&amp;/g, "&"),
              width: metadata.s.x,
              height: metadata.s.y,
              caption: item.caption || undefined,
            });
          }
        }
      }
    } else if (postData.media && postData.media.oembed) {
      // Embedded media (YouTube, etc.)
      media.type = "embed";
      media.provider = postData.media.oembed.provider_name;
      media.title = postData.media.oembed.title;
      media.html = postData.media.oembed.html;
      media.thumbnail_url = postData.media.oembed.thumbnail_url;
    } else if (postData.url && postData.url !== postData.permalink) {
      // External link
      media.type = "link";
      media.url = postData.url;
      media.domain = postData.domain;
    }

    // Add preview images if available
    if (
      postData.preview &&
      postData.preview.images &&
      postData.preview.images.length > 0
    ) {
      const preview = postData.preview.images[0];
      media.preview = {
        url: preview.source.url.replace(/&amp;/g, "&"),
        width: preview.source.width,
        height: preview.source.height,
      };
    }

    return media;
  }

  extractPostId(url: string): string | null {
    const match = url.match(/\/comments\/([a-zA-Z0-9]+)/);
    return match && match[1] ? match[1] : null;
  }

  private collectMoreObjects(
    comments: any[],
    depth = 0,
    moreObjects: any[] = [],
  ): any[] {
    for (const comment of comments) {
      if (comment.kind === "t1") {
        if (comment.data.replies && comment.data.replies.data) {
          this.collectMoreObjects(
            comment.data.replies.data.children,
            depth + 1,
            moreObjects,
          );
        }
      } else if (comment.kind === "more") {
        if (comment.data.children && comment.data.children.length > 0) {
          moreObjects.push({
            children: comment.data.children,
            depth: depth,
            count: comment.data.count || comment.data.children.length,
          });
        }
      }
    }
    return moreObjects;
  }

  private async batchFetchMoreComments(
    subreddit: string,
    postId: string,
    commentIds: string[],
  ): Promise<any[]> {
    if (!commentIds || commentIds.length === 0) return [];

    const ids = commentIds.slice(0, this.maxCommentsPerCall).join(",");
    const path = `/api/morechildren?api_type=json&link_id=t3_${postId}&children=${ids}`;

    try {
      logger.info(
        { commentCount: commentIds.length },
        "Fetching more comments batch",
      );
      const response = await this.apiRequest(path);
      return response.json?.data?.things || [];
    } catch (error: any) {
      logger.error({ error: error.message }, "Error fetching more comments");
      return [];
    }
  }

  private async fetchAllMoreComments(
    comments: any[],
    subreddit: string,
    postId: string,
  ): Promise<any[]> {
    let allComments = [...comments];
    let moreCalls = 0;

    logger.info("Starting smart comment fetching with batching");

    while (moreCalls < this.maxMoreCalls) {
      const moreObjects = this.collectMoreObjects(allComments);

      if (moreObjects.length === 0) {
        logger.info("No more comments to fetch");
        break;
      }

      if (this.prioritizeShallow) {
        moreObjects.sort((a, b) => {
          if (a.depth !== b.depth) return a.depth - b.depth;
          return b.count - a.count;
        });
      } else {
        moreObjects.sort((a, b) => b.count - a.count);
      }

      const batchIds: string[] = [];
      const selectedObjects: any[] = [];

      for (const moreObj of moreObjects) {
        const remainingCapacity = this.maxCommentsPerCall - batchIds.length;
        if (remainingCapacity <= 0) break;

        const idsToAdd = moreObj.children.slice(0, remainingCapacity);
        batchIds.push(...idsToAdd);
        selectedObjects.push({
          ...moreObj,
          children: idsToAdd,
        });

        if (batchIds.length >= this.maxCommentsPerCall) break;
      }

      if (batchIds.length === 0) break;

      logger.info(
        {
          batch: moreCalls + 1,
          maxCalls: this.maxMoreCalls,
          commentCount: batchIds.length,
          branches: selectedObjects.length,
        },
        "Processing comment batch",
      );

      const newComments = await this.batchFetchMoreComments(
        subreddit,
        postId,
        batchIds,
      );

      if (newComments.length === 0) {
        logger.warn("No comments returned from batch");
        break;
      }

      allComments = this.insertMoreComments(
        allComments,
        newComments,
        selectedObjects,
      );
      moreCalls++;

      logger.info(
        {
          addedComments: newComments.length,
          callsUsed: moreCalls,
          maxCalls: this.maxMoreCalls,
        },
        "Added comments from batch",
      );
    }

    if (moreCalls >= this.maxMoreCalls) {
      const remainingMore = this.collectMoreObjects(allComments);
      if (remainingMore.length > 0) {
        const remainingCount = remainingMore.reduce(
          (sum, obj) => sum + obj.children.length,
          0,
        );
        logger.warn(
          { remainingComments: remainingCount },
          "Reached API call limit, some comments not fetched",
        );
      }
    }

    return allComments;
  }

  private insertMoreComments(
    comments: any[],
    newComments: any[],
    selectedObjects: any[],
  ): any[] {
    const newCommentMap = new Map();
    newComments.forEach((comment) => {
      if (comment.kind === "t1") {
        newCommentMap.set(comment.data.id, comment);
      }
    });

    return this.replaceMoreInTree(comments, newCommentMap, selectedObjects);
  }

  private replaceMoreInTree(
    comments: any[],
    newCommentMap: Map<string, any>,
    selectedObjects: any[],
  ): any[] {
    const result = [];

    for (const comment of comments) {
      if (comment.kind === "t1") {
        const processedComment = { ...comment };
        if (comment.data.replies && comment.data.replies.data) {
          processedComment.data.replies.data.children = this.replaceMoreInTree(
            comment.data.replies.data.children,
            newCommentMap,
            selectedObjects,
          );
        }
        result.push(processedComment);
      } else if (comment.kind === "more") {
        const matchingObject = selectedObjects.find((obj) =>
          obj.children.some((id: string) => comment.data.children.includes(id)),
        );

        if (matchingObject) {
          for (const childId of matchingObject.children) {
            const newComment = newCommentMap.get(childId);
            if (newComment) {
              result.push(newComment);
            }
          }

          const remainingChildren = comment.data.children.filter(
            (id: string) => !matchingObject.children.includes(id),
          );

          if (remainingChildren.length > 0) {
            result.push({
              ...comment,
              data: {
                ...comment.data,
                children: remainingChildren,
              },
            });
          }
        } else {
          result.push(comment);
        }
      }
    }

    return result;
  }

  private processComments(comments: any[], depth = 0): any[] {
    const processed = [];

    for (const comment of comments) {
      if (comment.kind === "t1") {
        const processedComment: any = {
          id: comment.data.id,
          author: comment.data.author,
          body: comment.data.body,
          body_html: comment.data.body_html,
          score: comment.data.score,
          created_utc: comment.data.created_utc,
          depth: depth,
          replies: [],
        };

        if (comment.data.replies && comment.data.replies.data) {
          processedComment.replies = this.processComments(
            comment.data.replies.data.children,
            depth + 1,
          );
        }

        processed.push(processedComment);
      }
    }

    return processed;
  }

  private countComments(comments: any[]): number {
    let count = 0;
    for (const comment of comments) {
      count += 1 + this.countComments(comment.replies || []);
    }
    return count;
  }

  async fetchPostFromUrl(url: string): Promise<RedditApiResponse> {
    try {
      // Check if credentials are available before attempting to fetch
      if (!this.hasCredentials()) {
        return {
          success: false,
          error:
            "Reddit API credentials not available. Please set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET environment variables.",
        };
      }

      const postId = this.extractPostId(url);
      if (!postId) {
        return {
          success: false,
          error: "Invalid Reddit URL - could not extract post ID",
        };
      }

      const subredditMatch = url.match(/\/r\/([^/]+)/);
      const subreddit = subredditMatch ? subredditMatch[1] : null;

      if (!subreddit) {
        return {
          success: false,
          error: "Invalid Reddit URL - could not extract subreddit",
        };
      }

      logger.info(
        {
          postId,
          subreddit,
          maxCalls: this.maxMoreCalls,
          maxCommentsPerCall: this.maxCommentsPerCall,
        },
        "Fetching Reddit post",
      );

      // Fetch subreddit info and post data in parallel
      const [subredditInfo, postResponse] = await Promise.all([
        this.fetchSubredditInfo(subreddit),
        this.apiRequest(
          `/r/${subreddit}/comments/${postId}?raw_json=1&limit=500`,
        ),
      ]);

      if (!postResponse || postResponse.length < 2) {
        return { success: false, error: "Invalid response from Reddit API" };
      }

      const postData = postResponse[0].data.children[0].data;
      let commentsData = postResponse[1].data.children;

      logger.info(
        { initialComments: commentsData.length },
        "Initial comment fetch complete",
      );

      // Extract media information
      const mediaInfo = this.extractMediaInfo(postData);
      if (mediaInfo.type !== "none") {
        logger.info({ mediaType: mediaInfo.type }, "Detected media content");
      }

      // Fetch all "more" comments using batched approach
      commentsData = await this.fetchAllMoreComments(
        commentsData,
        subreddit,
        postId,
      );

      logger.info("Processing final comment tree");
      const comments = this.processComments(commentsData);
      const totalComments = this.countComments(comments);

      logger.info({ totalComments }, "Reddit post processing complete");

      const result = {
        post: {
          id: postData.id,
          title: postData.title,
          author: postData.author,
          subreddit: postData.subreddit,
          selftext: postData.selftext,
          selftext_html: postData.selftext_html,
          url: postData.url,
          is_self: postData.is_self,
          score: postData.ups - postData.downs,
          upvote_ratio: postData.upvote_ratio,
          num_comments: postData.num_comments,
          created_utc: postData.created_utc,
          permalink: postData.permalink,
          domain: postData.domain,
          media: mediaInfo,
        },
        subreddit: subredditInfo,
        comments: comments,
        stats: {
          totalComments: totalComments,
          apiCallsUsed:
            1 +
            Math.min(
              this.maxMoreCalls,
              this.collectMoreObjects(commentsData).length,
            ),
        },
        rawData: {
          postResponse: postResponse,
          subredditResponse: subredditInfo,
          fetchTimestamp: Date.now(),
          url: url,
        },
      };

      return { success: true, data: result };
    } catch (error: any) {
      logger.error({ error: error.message }, "Reddit API fetch failed");
      return { success: false, error: error.message };
    }
  }
}

export function createRedditApiClient(
  options?: RedditClientOptions,
): RedditApiClient {
  return new RedditApiClient(options);
}
