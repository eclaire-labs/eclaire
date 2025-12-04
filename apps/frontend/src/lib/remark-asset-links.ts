import type { Root, Text } from "mdast";
import { visit } from "unist-util-visit";
import type { ContentLink } from "@/types/message";

export interface AssetLinkData {
  contentLinks: ContentLink[];
}

/**
 * Custom remark plugin to detect and preserve asset links while maintaining markdown structure
 * Instead of splitting the content, we mark asset links for later processing
 */
export function remarkAssetLinks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function transformer(tree: Root, file: any) {
    const contentLinks: ContentLink[] = [];

    // Asset link pattern (same as in content-links.ts)
    const linkPattern =
      /(\/(?:bookmarks|documents|photos|tasks|notes)\/[a-zA-Z0-9_-]+)/g;

    // Visit all text nodes in the tree
    visit(tree, "text", (node: Text) => {
      if (typeof node.value === "string") {
        const matches = node.value.match(linkPattern);

        if (matches) {
          matches.forEach((match) => {
            const [, type, id] = match.split("/");
            if (type && id) {
              contentLinks.push({
                type: type.slice(0, -1) as ContentLink["type"], // Remove 's' from plural
                id,
                url: match,
                title: `${type.slice(0, -1)} ${id}`,
              });
            }
          });
        }
      }
    });

    // Store the detected links in the file data for later use
    if (!file.data) {
      file.data = {};
    }
    file.data.assetLinks = { contentLinks };
  };
}
