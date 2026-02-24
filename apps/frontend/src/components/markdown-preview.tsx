import React from "react";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  // Match **bold**, __bold__, `code`, *italic*, _italic_ — bold before italic for priority
  const pattern = /\*\*(.*?)\*\*|__(.*?)__|`([^`]+)`|\*(.*?)\*|_(.*?)_/g;
  let lastIndex = 0;
  let key = 0;

  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }

    if (match[1] != null) {
      elements.push(<strong key={key++}>{match[1]}</strong>);
    } else if (match[2] != null) {
      elements.push(<strong key={key++}>{match[2]}</strong>);
    } else if (match[3] != null) {
      elements.push(<code key={key++}>{match[3]}</code>);
    } else if (match[4] != null) {
      elements.push(<em key={key++}>{match[4]}</em>);
    } else if (match[5] != null) {
      elements.push(<em key={key++}>{match[5]}</em>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements;
}

interface MarkdownPreviewProps {
  content: string | null;
  maxLength?: number;
  className?: string;
  preserveFormatting?: boolean;
}

export function MarkdownPreview({
  content,
  maxLength = 100,
  className,
  preserveFormatting = false,
}: MarkdownPreviewProps) {
  const [processedContent, setProcessedContent] = React.useState<string>("");

  React.useEffect(() => {
    const processMarkdown = async () => {
      if (!content) {
        setProcessedContent("");
        return;
      }

      try {
        // Process markdown to extract plain text
        const result = await remark().use(remarkGfm).process(content);

        // Convert to plain text by removing all markdown syntax
        let plainText = String(result);

        if (preserveFormatting) {
          // Strip block-level syntax but keep inline formatting markers
          // (bold/italic/code rendered as React elements at render time)
          plainText = plainText
            .replace(/#{1,6}\s+/g, "") // Headers
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Links
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1") // Images
            .replace(/^[\s]*[-*+]\s+/gm, "") // List bullets
            .replace(/^[\s]*\d+\.\s+/gm, "") // Numbered lists
            .replace(/^>/gm, "") // Blockquotes
            .replace(/```[\s\S]*?```/g, ""); // Code blocks
        } else {
          // Strip all markdown syntax for pure text
          plainText = plainText
            // Remove headers
            .replace(/#{1,6}\s+/g, "")
            // Remove bold/italic
            .replace(/\*\*(.*?)\*\*/g, "$1")
            .replace(/__(.*?)__/g, "$1")
            .replace(/\*(.*?)\*/g, "$1")
            .replace(/_(.*?)_/g, "$1")
            // Remove links (keep text)
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            // Remove images (keep alt text)
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
            // Remove code blocks
            .replace(/```[\s\S]*?```/g, "")
            // Remove inline code
            .replace(/`([^`]+)`/g, "$1")
            // Remove list bullets
            .replace(/^[\s]*[-*+]\s+/gm, "")
            // Remove numbered lists
            .replace(/^[\s]*\d+\.\s+/gm, "")
            // Remove blockquotes
            .replace(/^>/gm, "")
            // Remove horizontal rules
            .replace(/^[\s]*[-*_]{3,}[\s]*$/gm, "")
            // Remove table syntax
            .replace(/\|/g, " ")
            // Clean up extra whitespace
            .replace(/\s+/g, " ")
            .trim();
        }

        // Apply length limit after processing
        if (plainText.length > maxLength) {
          plainText = `${plainText.substring(0, maxLength).trim()}...`;
        }

        setProcessedContent(plainText);
      } catch (error) {
        console.error("Failed to process markdown preview:", error);
        // Fallback to simple truncation
        const fallback =
          content.length > maxLength
            ? `${content.substring(0, maxLength).trim()}...`
            : content;
        setProcessedContent(fallback);
      }
    };

    processMarkdown();
  }, [content, maxLength, preserveFormatting]);

  if (!processedContent) {
    return (
      <span className={cn("text-muted-foreground italic", className)}>
        No content
      </span>
    );
  }

  if (preserveFormatting) {
    return (
      <span className={cn("text-sm", className)}>
        {renderInlineMarkdown(processedContent)}
      </span>
    );
  }

  return <span className={cn("text-sm", className)}>{processedContent}</span>;
}
