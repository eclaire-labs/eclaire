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
}

export function MarkdownDisplay({ content, className }: MarkdownDisplayProps) {
  const [processedContent, setProcessedContent] = React.useState<{
    htmlContent: string;
    contentLinks: ContentLink[];
  }>({ htmlContent: "", contentLinks: [] });

  React.useEffect(() => {
    const processMarkdown = async () => {
      try {
        // Detect content links in the raw content
        const detectedLinks = detectContentLinks(content);

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
  }, [content]);

  const proseClasses = cn(
    // Base prose styling
    "prose prose-neutral dark:prose-invert max-w-full",

    // Word wrapping and overflow handling
    "break-words overflow-wrap-anywhere",

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

  return (
    <div className={className}>
      {/* Render the markdown content normally */}
      <div
        className={proseClasses}
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
