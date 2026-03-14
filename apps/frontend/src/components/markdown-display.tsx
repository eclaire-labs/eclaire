import React from "react";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import { ContentLinkPreview } from "@/components/assistant/content-link-preview";
import {
  detectContentLinks,
  fetchContentMetadataBatch,
} from "@/lib/content-links";
import { cn } from "@/lib/utils";
import type { ContentLink } from "@/types/message";

interface MarkdownDisplayProps {
  content: string;
  className?: string;
  skipLinkDetection?: boolean;
}

export function MarkdownDisplay({
  content,
  className,
  skipLinkDetection,
}: MarkdownDisplayProps) {
  const [processedContent, setProcessedContent] = React.useState<{
    htmlContent: string;
    contentLinks: ContentLink[];
  }>({ htmlContent: "", contentLinks: [] });

  React.useEffect(() => {
    const processMarkdown = async () => {
      try {
        // Detect content links in the raw content (skip during streaming)
        const detectedLinks = skipLinkDetection
          ? []
          : detectContentLinks(content);

        // Fetch metadata for all detected links
        const linksWithMetadata =
          detectedLinks.length > 0
            ? await fetchContentMetadataBatch(detectedLinks)
            : [];

        // Process the entire markdown content normally
        const result = await remark()
          .use(remarkGfm) // GitHub Flavored Markdown support
          .use(remarkRehype) // Convert to rehype (HTML)
          .use(rehypeHighlight) // Code syntax highlighting
          .use(rehypeStringify) // Convert to HTML string
          .process(content);

        setProcessedContent({
          htmlContent: String(result),
          contentLinks: linksWithMetadata,
        });
      } catch (error) {
        console.error("Failed to process markdown:", error);
        // Fallback to plain text
        setProcessedContent({
          htmlContent: `<p>${content}</p>`,
          contentLinks: [],
        });
      }
    };

    if (content) {
      processMarkdown();
    }
  }, [content, skipLinkDetection]);

  const proseClasses = cn(
    // Base prose styling
    "prose prose-neutral dark:prose-invert max-w-full",

    // Remove extra margins on first/last elements for tight container fit
    "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",

    // Word wrapping and overflow handling
    "break-words overflow-wrap-anywhere",

    // Normalize line-height to match non-prose text
    "prose-p:leading-normal prose-li:leading-normal",

    // Light/dark mode adjustments for better contrast
    "dark:prose-p:text-gray-300 prose-p:text-gray-700",
    "dark:prose-li:text-gray-300 prose-li:text-gray-700",

    // Headings
    "prose-headings:scroll-mt-20",
    "prose-h1:text-3xl prose-h1:font-bold prose-h1:mb-4",
    "prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-10 prose-h2:mb-4",
    "prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-3",

    // Code blocks and inline code
    "prose-pre:bg-neutral-100 dark:prose-pre:bg-neutral-800",
    "prose-pre:text-neutral-800 dark:prose-pre:text-neutral-200",
    "prose-pre:border prose-pre:border-neutral-200 dark:prose-pre:border-neutral-700",
    "prose-pre:rounded-md",

    "prose-code:text-neutral-800 dark:prose-code:text-neutral-200",
    "prose-code:bg-neutral-100 dark:prose-code:bg-neutral-800",
    "prose-code:px-1 prose-code:py-0.5 prose-code:rounded-md",
    "prose-code:font-mono prose-code:text-sm",

    // Links
    "prose-a:text-primary dark:prose-a:text-primary",
    "prose-a:no-underline hover:prose-a:underline",

    // Other elements
    "prose-strong:text-neutral-900 dark:prose-strong:text-neutral-100",
    "prose-strong:font-semibold",

    "prose-blockquote:border-l-4 prose-blockquote:border-neutral-300 dark:prose-blockquote:border-neutral-700",
    "prose-blockquote:pl-4 prose-blockquote:text-neutral-700 dark:prose-blockquote:text-neutral-300",

    "prose-hr:border-neutral-200 dark:prose-hr:border-neutral-800",

    // Tables
    "prose-table:border prose-table:border-collapse",
    "prose-table:border-neutral-300 dark:prose-table:border-neutral-700",

    "prose-th:bg-neutral-100 dark:prose-th:bg-neutral-800",
    "prose-th:text-neutral-900 dark:prose-th:text-neutral-100",
    "prose-th:p-2 prose-th:border prose-th:border-neutral-300 dark:prose-th:border-neutral-700",

    "prose-td:p-2 prose-td:border prose-td:border-neutral-300 dark:prose-td:border-neutral-700",
  );

  const containerRef = React.useRef<HTMLDivElement>(null);

  // Inject copy buttons into code blocks after render
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when HTML content changes to inject buttons
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const copySvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
    const checkSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

    const preBlocks = container.querySelectorAll("pre");
    for (const pre of preBlocks) {
      if (pre.querySelector(".copy-code-btn")) continue;

      pre.style.position = "relative";

      const button = document.createElement("button");
      button.className =
        "copy-code-btn absolute top-2 right-2 p-1.5 rounded-md bg-neutral-200/80 dark:bg-neutral-700/80 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-600 dark:text-neutral-300 transition-opacity opacity-0";
      button.innerHTML = copySvg;
      button.title = "Copy code";

      button.addEventListener("click", () => {
        const code = pre.querySelector("code");
        if (code) {
          navigator.clipboard.writeText(code.textContent || "");
          button.innerHTML = checkSvg;
          setTimeout(() => {
            button.innerHTML = copySvg;
          }, 2000);
        }
      });

      pre.classList.add("group");
      pre.addEventListener("mouseenter", () => {
        button.style.opacity = "1";
      });
      pre.addEventListener("mouseleave", () => {
        button.style.opacity = "0";
      });

      pre.appendChild(button);
    }
  }, [processedContent.htmlContent]);

  return (
    <div ref={containerRef}>
      {/* Render the markdown content normally */}
      <div
        className={cn(proseClasses, className)}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized markdown rendering
        dangerouslySetInnerHTML={{ __html: processedContent.htmlContent }}
      />

      {/* Render detected asset links at the bottom if any were found */}
      {processedContent.contentLinks.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-sm text-muted-foreground mb-2">
            Referenced assets:
          </div>
          {processedContent.contentLinks.map((link, index) => (
            <ContentLinkPreview key={`${link.url}-${index}`} link={link} />
          ))}
        </div>
      )}
    </div>
  );
}
