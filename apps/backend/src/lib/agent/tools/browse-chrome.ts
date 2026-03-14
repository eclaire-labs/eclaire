import fs from "node:fs";
import path from "node:path";
import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { browserRuntime } from "../../browser/index.js";
import { createPhoto } from "../../services/photos.js";
import { agentToolCaller } from "./caller.js";

const inputSchema = z.object({
  action: z
    .enum([
      "listTabs",
      "selectTab",
      "open",
      "navigate",
      "snapshot",
      "click",
      "fill",
      "pressKey",
      "screenshot",
      "closeTab",
    ])
    .describe("The Chrome action to perform."),
  url: z
    .string()
    .optional()
    .describe("HTTP or HTTPS URL to open or navigate to."),
  tabId: z.string().optional().describe("Optional tab id from listTabs."),
  elementRef: z
    .string()
    .optional()
    .describe("Element reference from a prior snapshot (for click/fill)."),
  value: z
    .string()
    .optional()
    .describe("Value to fill into the referenced element."),
  key: z.string().optional().describe("Keyboard key to press."),
});

type BrowseChromeInput = z.infer<typeof inputSchema>;

function validateHttpUrl(value: string): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("browseChrome only accepts valid URLs.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("browseChrome only allows http and https URLs.");
  }

  return parsed.toString();
}

function assertBrowseChromeAllowed(
  input: BrowseChromeInput,
  ctx: Parameters<RuntimeToolDefinition<typeof inputSchema>["execute"]>[2],
): void {
  const authMethod =
    typeof ctx.extra?.callerAuthMethod === "string"
      ? ctx.extra.callerAuthMethod
      : null;
  const actorKind =
    typeof ctx.extra?.callerActorKind === "string"
      ? ctx.extra.callerActorKind
      : null;
  const isBackgroundTask = ctx.extra?.backgroundTaskExecution === true;

  if (isBackgroundTask) {
    throw new Error(
      "browseChrome is not available during background task execution.",
    );
  }

  if (
    actorKind !== "human" ||
    (authMethod !== "session" && authMethod !== "localhost")
  ) {
    throw new Error(
      "browseChrome is only available in human-authenticated browser sessions.",
    );
  }

  if ((input.action === "open" || input.action === "navigate") && !input.url) {
    throw new Error(`browseChrome ${input.action} requires a url.`);
  }

  if (input.action === "selectTab" && !input.tabId) {
    throw new Error("browseChrome selectTab requires a tabId.");
  }

  if (
    (input.action === "click" || input.action === "fill") &&
    !input.elementRef
  ) {
    throw new Error(`browseChrome ${input.action} requires an elementRef.`);
  }

  if (input.action === "fill" && input.value === undefined) {
    throw new Error("browseChrome fill requires a value.");
  }

  if (input.action === "pressKey" && !input.key) {
    throw new Error("browseChrome pressKey requires a key.");
  }
}

function formatTabList(
  tabs: Awaited<ReturnType<typeof browserRuntime.listTabs>>,
): string {
  if (tabs.length === 0) {
    return "No Chrome tabs are currently available.";
  }

  return tabs
    .map(
      (tab) =>
        `${tab.selected ? "*" : "-"} ${tab.id}: ${tab.title} (${tab.url || "about:blank"})`,
    )
    .join("\n");
}

export const browseChromeTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "browseChrome",
  label: "Browse Chrome",
  description:
    "Use the user's live Chrome session for authenticated browsing and interactive page actions.",
  inputSchema,
  promptSnippet: [
    "Use browseChrome only when a task depends on the user's existing Chrome session, authenticated pages, or interactive browser actions.",
    "Prefer browseWeb for public-web research and read-only browsing.",
  ].join(" "),
  promptGuidelines: [
    "Start with listTabs or open before interactive actions if you do not already know the active tab.",
    "Use snapshot before click or fill so you have fresh element references.",
    "Only use tab ids returned by listTabs.",
  ],
  execute: async (_callId, input, ctx) => {
    try {
      assertBrowseChromeAllowed(input, ctx);

      const runtimeContext = {
        sessionId: ctx.sessionId,
        conversationId:
          typeof ctx.extra?.conversationId === "string"
            ? ctx.extra.conversationId
            : undefined,
        requestId: ctx.requestId,
      };

      switch (input.action) {
        case "listTabs": {
          const tabs = await browserRuntime.listTabs(runtimeContext);
          return textResult(formatTabList(tabs), {
            transport: "chrome-mcp",
            tabs,
          });
        }

        case "selectTab": {
          const tab = await browserRuntime.selectTab(
            input.tabId || "",
            runtimeContext,
          );
          return textResult(`Selected tab ${tab.id}: ${tab.title}`, {
            transport: "chrome-mcp",
            activeTab: tab,
          });
        }

        case "open": {
          const url = validateHttpUrl(input.url || "");
          const result = await browserRuntime.open(url, runtimeContext);
          return textResult(result.message, {
            transport: "chrome-mcp",
            activeTab: result.tab,
          });
        }

        case "navigate": {
          const url = validateHttpUrl(input.url || "");
          const result = await browserRuntime.navigate(
            url,
            runtimeContext,
            input.tabId,
          );
          return textResult(result.message, {
            transport: "chrome-mcp",
            activeTab: result.tab,
          });
        }

        case "snapshot": {
          const result = await browserRuntime.snapshot(
            runtimeContext,
            input.tabId,
          );
          return textResult(result.snapshot, {
            transport: "chrome-mcp",
            activeTab: result.tab,
          });
        }

        case "click": {
          const result = await browserRuntime.click(
            input.elementRef || "",
            runtimeContext,
            input.tabId,
          );
          return textResult(result.message, {
            transport: "chrome-mcp",
            activeTab: result.tab,
          });
        }

        case "fill": {
          const result = await browserRuntime.fill(
            input.elementRef || "",
            input.value || "",
            runtimeContext,
            input.tabId,
          );
          return textResult(result.message, {
            transport: "chrome-mcp",
            activeTab: result.tab,
          });
        }

        case "pressKey": {
          const result = await browserRuntime.pressKey(
            input.key || "",
            runtimeContext,
            input.tabId,
          );
          return textResult(result.message, {
            transport: "chrome-mcp",
            activeTab: result.tab,
          });
        }

        case "screenshot": {
          const result = await browserRuntime.screenshot(
            runtimeContext,
            input.tabId,
          );
          const screenshotBuffer = fs.readFileSync(result.screenshotPath);
          const photo = await createPhoto(
            {
              content: screenshotBuffer,
              metadata: {
                title: `Screenshot – ${result.tab.title}`,
                description: `Screenshot of ${result.tab.url}`,
                tags: ["chrome-screenshot"],
                originalFilename: path.basename(result.screenshotPath),
              },
              originalMimeType: "image/png",
              userAgent: "browseChrome",
              extractedMetadata: {},
            },
            ctx.userId,
            agentToolCaller(ctx),
          );
          return textResult(
            `Screenshot saved as /photos/${photo.id}\nTitle: ${photo.title}\nURL: ${result.tab.url}`,
            {
              transport: "chrome-mcp",
              activeTab: result.tab,
              photoId: photo.id,
            },
          );
        }

        case "closeTab": {
          const result = await browserRuntime.closeTab(
            runtimeContext,
            input.tabId,
          );
          return textResult(result.message, {
            transport: "chrome-mcp",
            closedTab: result.closedTab,
            activeTab: result.nextTab,
          });
        }
      }
    } catch (error) {
      return errorResult(
        error instanceof Error ? error.message : "browseChrome failed",
        { transport: "chrome-mcp" },
      );
    }
  },
};
