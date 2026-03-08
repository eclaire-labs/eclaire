import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { Lexer, type Token, type Tokens } from "marked";

interface MarkdownProps {
  content: string;
}

/**
 * Detect an unclosed code fence at the end of streaming content.
 * Tracks open/close state properly so closing fences aren't mistaken for openers.
 */
function splitUnfinishedCodeBlock(
  content: string,
): { before: string; lang: string; code: string } | null {
  const fencePattern = /^(`{3,})(\w*)\s*$/gm;
  let inCode = false;
  let openFence: { index: number; marker: string; lang: string } | null = null;

  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(content)) !== null) {
    if (!inCode) {
      // Opening fence
      inCode = true;
      openFence = {
        index: match.index,
        marker: match[1]!,
        lang: match[2] || "",
      };
    } else if (match[1]!.length >= openFence!.marker.length) {
      // Closing fence (must have >= same number of backticks)
      inCode = false;
      openFence = null;
    }
  }

  // If we ended outside a code block, everything is properly closed
  if (!inCode || !openFence) return null;

  const before = content.slice(0, openFence.index);
  const codeStart =
    openFence.index + openFence.marker.length + openFence.lang.length;
  const code = content.slice(codeStart).replace(/^\n/, "");

  return { before, lang: openFence.lang, code };
}

/**
 * Render inline tokens (bold, italic, code, links, etc.) recursively.
 */
function renderInline(
  tokens: Token[] | undefined,
  key = "",
): React.ReactNode[] {
  if (!tokens) return [];

  return tokens.map((token, i) => {
    const k = `${key}-${i}`;

    switch (token.type) {
      case "strong":
        return (
          <Text key={k} bold>
            {renderInline((token as Tokens.Strong).tokens, k)}
          </Text>
        );
      case "em":
        return (
          <Text key={k} italic>
            {renderInline((token as Tokens.Em).tokens, k)}
          </Text>
        );
      case "del":
        return (
          <Text key={k} strikethrough>
            {renderInline((token as Tokens.Del).tokens, k)}
          </Text>
        );
      case "codespan":
        return (
          <Text key={k} color="yellow">
            {(token as Tokens.Codespan).text}
          </Text>
        );
      case "link":
        return (
          <Text key={k} color="blue" underline>
            {(token as Tokens.Link).text}
          </Text>
        );
      case "br":
        return <Text key={k}>{"\n"}</Text>;
      case "text": {
        const textToken = token as Tokens.Text;
        if (textToken.tokens) {
          return <Text key={k}>{renderInline(textToken.tokens, k)}</Text>;
        }
        return <Text key={k}>{textToken.text}</Text>;
      }
      case "escape":
        return <Text key={k}>{(token as Tokens.Escape).text}</Text>;
      default:
        if ("text" in token) {
          return <Text key={k}>{(token as { text: string }).text}</Text>;
        }
        return null;
    }
  });
}

/**
 * Render a single list item, handling nested content and sub-lists.
 */
function renderListItem(
  item: Tokens.ListItem,
  index: number,
  ordered: boolean,
  depth: number,
): React.ReactNode {
  const indent = "  ".repeat(depth);
  const bullet = ordered ? `${index + 1}. ` : "- ";
  const parts: React.ReactNode[] = [];

  for (let i = 0; i < item.tokens.length; i++) {
    const child = item.tokens[i]!;
    if (child.type === "list") {
      parts.push(
        renderList(child as Tokens.List, depth + 1, `${index}-${i}`),
      );
    } else if (child.type === "text" || child.type === "paragraph") {
      const inlineTokens =
        "tokens" in child ? (child as Tokens.Paragraph).tokens : undefined;
      if (i === 0) {
        parts.push(
          <Text key={`item-${index}-${i}`} wrap="wrap">
            {indent}
            <Text color="cyan">{bullet}</Text>
            {inlineTokens
              ? renderInline(inlineTokens, `li-${index}-${i}`)
              : (child as { text: string }).text}
          </Text>,
        );
      } else {
        parts.push(
          <Text key={`item-${index}-${i}`} wrap="wrap">
            {indent}
            {"  "}
            {inlineTokens
              ? renderInline(inlineTokens, `li-${index}-${i}`)
              : (child as { text: string }).text}
          </Text>,
        );
      }
    }
  }

  return <React.Fragment key={`listitem-${index}`}>{parts}</React.Fragment>;
}

function renderList(
  token: Tokens.List,
  depth: number,
  keyPrefix = "",
): React.ReactNode {
  return (
    <Box key={`list-${keyPrefix}`} flexDirection="column">
      {token.items.map((item, i) =>
        renderListItem(item, i, token.ordered, depth),
      )}
    </Box>
  );
}

/**
 * Render an in-progress code block (unclosed fence during streaming).
 */
function renderStreamingCodeBlock(
  lang: string,
  code: string,
): React.ReactNode {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>{`\`\`\`${lang}`}</Text>
      <Box marginLeft={2}>
        <Text color="green">{code}</Text>
      </Box>
      <Text color="yellow">▋</Text>
    </Box>
  );
}

/**
 * Render a top-level block token to Ink components.
 */
function renderBlock(token: Token, index: number): React.ReactNode {
  switch (token.type) {
    case "heading": {
      const heading = token as Tokens.Heading;
      const prefix =
        heading.depth >= 3 ? "#".repeat(heading.depth) + " " : "";
      return (
        <Box key={index} marginTop={index > 0 ? 1 : 0}>
          <Text bold color="cyan" underline={heading.depth === 1}>
            {prefix}
            {renderInline(heading.tokens, `h-${index}`)}
          </Text>
        </Box>
      );
    }

    case "paragraph": {
      const para = token as Tokens.Paragraph;
      return (
        <Text key={index} wrap="wrap">
          {renderInline(para.tokens, `p-${index}`)}
        </Text>
      );
    }

    case "code": {
      const code = token as Tokens.Code;
      const langLabel = code.lang || "";
      return (
        <Box
          key={index}
          flexDirection="column"
          marginTop={1}
          marginBottom={1}
        >
          <Text dimColor>{`\`\`\`${langLabel}`}</Text>
          <Box marginLeft={2}>
            <Text color="green">{code.text}</Text>
          </Box>
          <Text dimColor>{"```"}</Text>
        </Box>
      );
    }

    case "blockquote": {
      const bq = token as Tokens.Blockquote;
      const innerNodes = bq.tokens.flatMap((t, i) => {
        if (t.type === "paragraph") {
          return renderInline(
            (t as Tokens.Paragraph).tokens,
            `bq-${index}-${i}`,
          );
        }
        if ("text" in t) {
          return (
            <Text key={`bq-${index}-${i}`}>
              {(t as { text: string }).text}
            </Text>
          );
        }
        return null;
      });

      return (
        <Text key={index} wrap="wrap">
          <Text dimColor>│ </Text>
          <Text italic>{innerNodes}</Text>
        </Text>
      );
    }

    case "list":
      return renderList(token as Tokens.List, 0, `${index}`);

    case "hr":
      return (
        <Text key={index} dimColor>
          {"─".repeat(40)}
        </Text>
      );

    case "space":
      return <Box key={index} marginY={0}><Text>{""}</Text></Box>;

    case "html":
      return (
        <Text key={index} dimColor wrap="wrap">
          {(token as Tokens.HTML).text}
        </Text>
      );

    case "table": {
      const table = token as Tokens.Table;
      const headers = table.header.map((h) =>
        h.tokens
          ? h.tokens
              .map((t) =>
                "text" in t ? (t as { text: string }).text : "",
              )
              .join("")
          : "",
      );
      const rows = table.rows.map((row) =>
        row.map((cell) =>
          cell.tokens
            ? cell.tokens
                .map((t) =>
                  "text" in t ? (t as { text: string }).text : "",
                )
                .join("")
            : "",
        ),
      );

      const colWidths = headers.map((h, ci) => {
        const maxRow = rows.reduce(
          (max, row) => Math.max(max, (row[ci] || "").length),
          0,
        );
        return Math.max(h.length, maxRow);
      });

      const padCell = (text: string, width: number) =>
        text + " ".repeat(Math.max(0, width - text.length));

      const headerLine = headers
        .map((h, i) => padCell(h, colWidths[i]!))
        .join(" │ ");
      const separator = colWidths.map((w) => "─".repeat(w)).join("─┼─");

      return (
        <Box key={index} flexDirection="column">
          <Text>{headerLine}</Text>
          <Text dimColor>{separator}</Text>
          {rows.map((row, ri) => (
            <Text key={ri}>
              {row
                .map((cell, ci) => padCell(cell, colWidths[ci]!))
                .join(" │ ")}
            </Text>
          ))}
        </Box>
      );
    }

    default:
      if ("text" in token) {
        return (
          <Text key={index} wrap="wrap">
            {(token as { text: string }).text}
          </Text>
        );
      }
      return null;
  }
}

export function Markdown({ content }: MarkdownProps) {
  const rendered = useMemo(() => {
    if (!content) return null;

    try {
      // Check for unclosed code fence (streaming partial content)
      const unfinished = splitUnfinishedCodeBlock(content);
      if (unfinished) {
        const parts: React.ReactNode[] = [];
        if (unfinished.before.trim()) {
          const tokens = new Lexer().lex(unfinished.before);
          parts.push(
            ...tokens.map((token, i) => renderBlock(token, i)),
          );
        }
        parts.push(
          renderStreamingCodeBlock(unfinished.lang, unfinished.code),
        );
        return parts;
      }

      const tokens = new Lexer().lex(content);
      return tokens.map((token, i) => renderBlock(token, i));
    } catch {
      // Fallback to plain text if lexer fails
      return <Text wrap="wrap">{content}</Text>;
    }
  }, [content]);

  return <Box flexDirection="column">{rendered}</Box>;
}
