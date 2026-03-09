/**
 * Shared browser pipeline for bookmark processing.
 *
 * Centralizes browser lifecycle management, screenshot capture, PDF generation,
 * and favicon extraction with consistent timeout handling and error boundaries.
 * All three bookmark handlers (regular, GitHub, Reddit) use this pipeline.
 */
import { type BrowserContext, chromium, type Page } from "patchright";
import sharp from "sharp";
import type { Logger } from "pino";
import { buildKey, getStorage } from "../../../lib/storage/index.js";
import { config } from "../../config.js";
import { TimeoutError, withTimeout } from "../utils/timeout.js";
import { generateOptimizedPdf } from "./utils.js";

// --- Types ---

export interface NavigationResult {
  normalizedUrl: string;
  contentType: string;
  etag: string;
  lastModified: string;
}

export interface ScreenshotArtifacts {
  thumbnailStorageId?: string;
  screenshotDesktopStorageId?: string;
  screenshotFullPageStorageId?: string;
  screenshotMobileStorageId?: string;
}

export interface PdfArtifacts {
  pdfStorageId?: string;
}

export interface BrowserPipelineOptions {
  bookmarkId: string;
  userId: string;
  logger: Logger;
}

// --- Pipeline ---

export class BrowserPipeline {
  private bookmarkId: string;
  private userId: string;
  private logger: Logger;
  // biome-ignore lint/suspicious/noExplicitAny: Patchright Browser instance, no exported type available
  private browser: any = null;
  private context: BrowserContext | null = null;
  private _page: Page | null = null;

  constructor(opts: BrowserPipelineOptions) {
    this.bookmarkId = opts.bookmarkId;
    this.userId = opts.userId;
    this.logger = opts.logger;
  }

  /** Access the underlying page for handler-specific operations (e.g. page.evaluate) */
  get page(): Page {
    if (!this._page) {
      throw new Error(
        "BrowserPipeline: page not available. Call launch() first.",
      );
    }
    return this._page;
  }

  /**
   * Launch browser, create context and page.
   */
  async launch(): Promise<void> {
    this.logger.debug({ bookmarkId: this.bookmarkId }, "Launching browser...");
    try {
      this.browser = await withTimeout(
        chromium.launch({
          headless: true,
          args: ["--use-mock-keychain"],
        }),
        config.timeouts.browserContext,
        "Browser launch",
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new Error(
          `Browser launch timed out after ${config.timeouts.browserContext}ms`,
        );
      }
      throw error;
    }

    this.context = await this.browser.newContext({ viewport: null });
    if (!this.context) {
      throw new Error("Failed to create browser context");
    }

    this._page = await this.context.newPage();
    this.logger.debug(
      { bookmarkId: this.bookmarkId },
      "Browser launched successfully",
    );
  }

  /**
   * Navigate to a URL with fallback strategies.
   * First tries networkidle, falls back to load on timeout.
   */
  async navigateTo(url: string): Promise<NavigationResult> {
    const page = this.page;

    // biome-ignore lint/suspicious/noImplicitAnyLet: type inferred from page.goto
    let response;
    try {
      this.logger.debug(
        { bookmarkId: this.bookmarkId, url },
        "Navigating to page...",
      );
      response = await withTimeout(
        page.goto(url, {
          waitUntil: "networkidle",
          timeout: 60000,
        }),
        config.timeouts.pageNavigation,
        "Page navigation",
      );
    } catch (navError: unknown) {
      this.logger.warn(
        {
          bookmarkId: this.bookmarkId,
          url,
          error:
            navError instanceof Error ? navError.message : String(navError),
        },
        "Navigation failed, attempting with reduced timeout",
      );
      try {
        response = await withTimeout(
          page.goto(url, {
            waitUntil: "load",
            timeout: 30000,
          }),
          35000,
          "Page navigation (retry)",
        );
      } catch (retryError: unknown) {
        if (retryError instanceof TimeoutError) {
          throw new Error(
            `Page navigation timed out after retries (${retryError.message})`,
          );
        }
        throw retryError;
      }
    }

    return {
      normalizedUrl: page.url(),
      contentType: response?.headers()["content-type"] || "",
      etag: response?.headers().etag || "",
      lastModified: response?.headers()["last-modified"] || "",
    };
  }

  /**
   * Navigate to inline HTML content (e.g. for Reddit rendered HTML).
   */
  async navigateToHtml(html: string): Promise<void> {
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await this.page.goto(dataUrl, { waitUntil: "networkidle", timeout: 60000 });
  }

  /**
   * Wait for page readiness before taking screenshots.
   * Waits for fonts and near-viewport images to load.
   */
  async waitForPageReady(): Promise<void> {
    const page = this.page;

    // Wait for web fonts
    try {
      await withTimeout(
        page.evaluate(() => (document.fonts as FontFaceSet)?.ready),
        5000,
        "Font loading",
      );
    } catch {
      this.logger.debug(
        { bookmarkId: this.bookmarkId },
        "Font readiness wait timed out, continuing",
      );
    }

    // Wait for near-viewport lazy images
    try {
      await withTimeout(
        page.evaluate(() => {
          return Promise.all(
            Array.from(document.images)
              .filter(
                (img) =>
                  !img.complete &&
                  img.getBoundingClientRect().top < window.innerHeight * 2,
              )
              .map(
                (img) =>
                  new Promise((resolve) => {
                    img.onload = img.onerror = resolve;
                  }),
              ),
          );
        }),
        5000,
        "Image loading",
      );
    } catch {
      this.logger.debug(
        { bookmarkId: this.bookmarkId },
        "Image readiness wait timed out, continuing",
      );
    }

    // Short settle time for CSS transitions
    await page.waitForTimeout(500);
  }

  /**
   * Capture all screenshots (desktop, thumbnail, full-page, mobile).
   * Desktop/thumbnail failure is fatal. Full-page and mobile failures are non-fatal.
   */
  async captureAllScreenshots(): Promise<ScreenshotArtifacts> {
    const page = this.page;
    const storage = getStorage();
    const artifacts: ScreenshotArtifacts = {};

    // Wait for page readiness
    await this.waitForPageReady();

    // Desktop screenshot (fatal if it fails)
    this.logger.debug(
      { bookmarkId: this.bookmarkId },
      "Taking desktop screenshot...",
    );
    await page.setViewportSize({ width: 1920, height: 1080 });

    const ssDesktopBuffer: Buffer = await withTimeout(
      page.screenshot({ type: "png", timeout: 30000 }),
      config.timeouts.screenshotDesktop,
      "Desktop screenshot",
    );

    // WORKAROUND: Extract raw pixel data to bypass libvips colorspace interpretation issues.
    // Playwright/patchright PNGs can include colorspace metadata (e.g., sRGB IEC61966-2.1)
    // that sharp's underlying libvips library doesn't recognize, causing corrupt output.
    // This re-encodes via raw pixels, doubling memory usage per screenshot.
    // TODO: Periodically test if this is still needed with newer sharp/patchright versions.
    const { data: rawPixels, info: imageInfo } = await sharp(ssDesktopBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const rawInput = {
      raw: {
        width: imageInfo.width,
        height: imageInfo.height,
        channels: imageInfo.channels,
      },
    };

    // Thumbnail (800x800, WebP quality 80)
    const thumbnailBuffer = await sharp(rawPixels, rawInput)
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const thumbnailKey = buildKey(
      this.userId,
      "bookmarks",
      this.bookmarkId,
      "thumbnail.webp",
    );
    await storage.writeBuffer(thumbnailKey, thumbnailBuffer, {
      contentType: "image/webp",
    });
    artifacts.thumbnailStorageId = thumbnailKey;

    // Desktop screenshot (1920x1440, 90% quality)
    const screenshotBuffer = await sharp(rawPixels, rawInput)
      .resize(1920, 1440, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    const screenshotKey = buildKey(
      this.userId,
      "bookmarks",
      this.bookmarkId,
      "screenshot.jpg",
    );
    await storage.writeBuffer(screenshotKey, screenshotBuffer, {
      contentType: "image/jpeg",
    });
    artifacts.screenshotDesktopStorageId = screenshotKey;

    this.logger.debug(
      { bookmarkId: this.bookmarkId },
      "Desktop screenshot completed",
    );

    // Full-page screenshot (non-fatal)
    try {
      const ssFullPageBuffer = await withTimeout(
        page.screenshot({ type: "png", fullPage: true, timeout: 45000 }),
        config.timeouts.screenshotFullpage,
        "Full page screenshot",
      );
      const fullpageKey = buildKey(
        this.userId,
        "bookmarks",
        this.bookmarkId,
        "screenshot-fullpage.png",
      );
      await storage.writeBuffer(fullpageKey, ssFullPageBuffer, {
        contentType: "image/png",
      });
      artifacts.screenshotFullPageStorageId = fullpageKey;
    } catch (err: unknown) {
      this.logger.warn(
        {
          bookmarkId: this.bookmarkId,
          error: err instanceof Error ? err.message : String(err),
        },
        "Full page screenshot failed, skipping",
      );
    }

    // Mobile screenshot (non-fatal)
    try {
      await page.setViewportSize({ width: 375, height: 667 });
      const ssMobileBuffer = await withTimeout(
        page.screenshot({ type: "png", timeout: 30000 }),
        config.timeouts.screenshotMobile,
        "Mobile screenshot",
      );
      const mobileKey = buildKey(
        this.userId,
        "bookmarks",
        this.bookmarkId,
        "screenshot-mobile.png",
      );
      await storage.writeBuffer(mobileKey, ssMobileBuffer, {
        contentType: "image/png",
      });
      artifacts.screenshotMobileStorageId = mobileKey;
    } catch (err: unknown) {
      this.logger.warn(
        {
          bookmarkId: this.bookmarkId,
          error: err instanceof Error ? err.message : String(err),
        },
        "Mobile screenshot failed, skipping",
      );
    }

    return artifacts;
  }

  /**
   * Generate a PDF of the current page. Non-fatal on failure.
   */
  async capturePdf(): Promise<PdfArtifacts> {
    const page = this.page;
    const storage = getStorage();

    try {
      // Reset viewport for PDF
      await page.setViewportSize({ width: 1920, height: 1080 });

      const pdfBuffer = await withTimeout(
        generateOptimizedPdf(page, this.bookmarkId),
        config.timeouts.pdfGeneration,
        "PDF generation",
      );
      const pdfKey = buildKey(
        this.userId,
        "bookmarks",
        this.bookmarkId,
        "content.pdf",
      );
      await storage.writeBuffer(pdfKey, pdfBuffer, {
        contentType: "application/pdf",
      });
      return { pdfStorageId: pdfKey };
    } catch (err: unknown) {
      this.logger.warn(
        {
          bookmarkId: this.bookmarkId,
          error: err instanceof Error ? err.message : String(err),
        },
        "PDF generation failed, skipping",
      );
      return {};
    }
  }

  /**
   * Extract favicon from the current page. Non-fatal on failure.
   */
  async extractFavicon(): Promise<string | null> {
    const page = this.page;

    try {
      const faviconHref = await page.evaluate(() => {
        const link =
          document.querySelector("link[rel='icon']") ||
          document.querySelector("link[rel='shortcut icon']");
        return link?.getAttribute("href") || null;
      });

      if (!faviconHref) {
        this.logger.debug(
          { bookmarkId: this.bookmarkId },
          "No favicon link found",
        );
        return null;
      }

      const absoluteFaviconUrl = new URL(faviconHref, page.url()).href;
      const faviconResponse = await page.request.get(absoluteFaviconUrl);

      if (!faviconResponse.ok()) return null;

      const faviconBuffer = await faviconResponse.body();
      if (faviconBuffer.length === 0) return null;

      const contentType =
        faviconResponse.headers()["content-type"] || "image/x-icon";
      let ext = ".ico";
      if (contentType.includes("svg")) ext = ".svg";
      else if (contentType.includes("png")) ext = ".png";
      else if (contentType.includes("jpeg") || contentType.includes("jpg"))
        ext = ".jpg";
      else if (contentType.includes("gif")) ext = ".gif";

      const storage = getStorage();
      const faviconKey = buildKey(
        this.userId,
        "bookmarks",
        this.bookmarkId,
        `favicon${ext}`,
      );
      await storage.writeBuffer(faviconKey, faviconBuffer, { contentType });

      this.logger.debug(
        { bookmarkId: this.bookmarkId, faviconKey },
        "Favicon saved",
      );
      return faviconKey;
    } catch (err: unknown) {
      this.logger.debug(
        {
          bookmarkId: this.bookmarkId,
          error: err instanceof Error ? err.message : String(err),
        },
        "Favicon extraction failed",
      );
      return null;
    }
  }

  /**
   * Get the rendered HTML content of the current page.
   */
  async getPageContent(): Promise<string> {
    return this.page.content();
  }

  /**
   * Clean up browser resources with individual timeouts.
   */
  async cleanup(): Promise<void> {
    this.logger.debug(
      { bookmarkId: this.bookmarkId },
      "Cleaning up browser resources...",
    );

    const CLEANUP_TIMEOUT = 5000;

    try {
      if (this._page && !this._page.isClosed()) {
        await withTimeout(this._page.close(), CLEANUP_TIMEOUT, "Page close");
      }
    } catch (err: unknown) {
      this.logger.warn(
        {
          bookmarkId: this.bookmarkId,
          error: err instanceof Error ? err.message : String(err),
        },
        "Failed to close page during cleanup",
      );
    }

    try {
      if (this.context) {
        await withTimeout(
          this.context.close(),
          CLEANUP_TIMEOUT,
          "Context close",
        );
      }
    } catch (err: unknown) {
      this.logger.warn(
        {
          bookmarkId: this.bookmarkId,
          error: err instanceof Error ? err.message : String(err),
        },
        "Failed to close browser context during cleanup",
      );
    }

    try {
      if (this.browser) {
        await withTimeout(
          this.browser.close(),
          CLEANUP_TIMEOUT,
          "Browser close",
        );
      }
    } catch (err: unknown) {
      this.logger.warn(
        {
          bookmarkId: this.bookmarkId,
          error: err instanceof Error ? err.message : String(err),
        },
        "Failed to close browser during cleanup",
      );
    }

    this.logger.debug(
      { bookmarkId: this.bookmarkId },
      "Browser cleanup completed",
    );
  }
}
