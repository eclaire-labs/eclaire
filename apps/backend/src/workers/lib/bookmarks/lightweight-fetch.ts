/**
 * Lightweight HTTP fetch + Readability extraction.
 *
 * Attempts content extraction without a browser. Returns null on any failure
 * so the caller can silently fall through to the full browser pipeline.
 */
import { Readability } from "@mozilla/readability";
import axios from "axios";
import { JSDOM } from "jsdom";
import { createChildLogger } from "../../../lib/logger.js";

const logger = createChildLogger("lightweight-fetch");

/** Minimum characters of readable text to consider extraction successful */
const MIN_TEXT_LENGTH = 200;

/** Maximum response body size to attempt parsing (10 MB) */
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

/** HTTP fetch timeout in milliseconds */
const FETCH_TIMEOUT_MS = 12_000;

export interface LightweightFetchResult {
  /** The raw HTML string from the HTTP response */
  html: string;
  /** The final URL after redirects */
  finalUrl: string;
  /** Content-Type header from the response */
  contentType: string;
  /** ETag header if present */
  etag: string;
  /** Last-Modified header if present */
  lastModified: string;
}

/**
 * Perform a lightweight HTTP GET and validate the response is parseable HTML
 * with meaningful Readability content.
 *
 * Returns the raw HTML and navigation-equivalent metadata on success,
 * or null if the content is not suitable for lightweight extraction.
 *
 * This function NEVER throws. Any error returns null.
 */
export async function lightweightFetch(
  url: string,
  bookmarkId: string,
): Promise<LightweightFetchResult | null> {
  try {
    const response = await axios.get(url, {
      timeout: FETCH_TIMEOUT_MS,
      maxRedirects: 5,
      maxContentLength: MAX_RESPONSE_BYTES,
      responseType: "text",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });

    if (response.status !== 200) {
      logger.debug(
        { bookmarkId, status: response.status },
        "Lightweight fetch: non-200 status",
      );
      return null;
    }

    const contentType = (response.headers["content-type"] || "").toLowerCase();
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml")
    ) {
      logger.debug(
        { bookmarkId, contentType },
        "Lightweight fetch: non-HTML content type",
      );
      return null;
    }

    const html = response.data;
    if (typeof html !== "string" || html.length === 0) {
      logger.debug({ bookmarkId }, "Lightweight fetch: empty response body");
      return null;
    }

    // Quick Readability quality check -- parse and verify minimum content
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();

    if (!article || !article.title) {
      logger.debug(
        { bookmarkId },
        "Lightweight fetch: Readability produced no title",
      );
      return null;
    }

    const textContent = article.textContent || "";
    if (textContent.length < MIN_TEXT_LENGTH) {
      logger.debug(
        { bookmarkId, textLength: textContent.length },
        "Lightweight fetch: insufficient text content (likely JS-rendered SPA)",
      );
      return null;
    }

    logger.info(
      { bookmarkId, textLength: textContent.length, title: article.title },
      "Lightweight fetch: content extraction succeeded",
    );

    // Derive the final URL after redirects
    const finalUrl =
      response.request?.res?.responseUrl || response.config?.url || url;

    return {
      html,
      finalUrl,
      contentType: response.headers["content-type"] || "",
      etag: response.headers.etag || "",
      lastModified: response.headers["last-modified"] || "",
    };
  } catch (error: unknown) {
    logger.debug(
      {
        bookmarkId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Lightweight fetch failed, will use browser fallback",
    );
    return null;
  }
}
