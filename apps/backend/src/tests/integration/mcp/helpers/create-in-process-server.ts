/**
 * Preset in-process MCP server factories for integration tests.
 */
import { createTestMcpServer, type TestMcpServer } from "@eclaire/ai";
import { z } from "zod";

/**
 * Server with 3 tools: echo, add, fail_tool.
 * Covers basic text results, numeric args, and isError responses.
 */
export function createEchoServer(): Promise<TestMcpServer> {
  return createTestMcpServer({
    name: "echo-server",
    tools: [
      {
        name: "echo",
        description: "Echoes the input message back",
        schema: { message: z.string() },
        handler: (args) => ({
          content: [{ type: "text", text: String(args.message) }],
        }),
      },
      {
        name: "add",
        description: "Adds two numbers",
        schema: { a: z.number(), b: z.number() },
        handler: (args) => ({
          content: [
            { type: "text", text: String(Number(args.a) + Number(args.b)) },
          ],
        }),
      },
      {
        name: "fail_tool",
        description: "Always returns an error",
        handler: () => ({
          content: [{ type: "text", text: "Something went wrong" }],
          isError: true,
        }),
      },
    ],
  });
}

/**
 * Server with 5 distinctly-named tools for testing allowedTools/blockedTools filtering.
 */
export function createFilterTestServer(): Promise<TestMcpServer> {
  const toolNames = [
    "alpha_read",
    "beta_write",
    "gamma_delete",
    "delta_list",
    "epsilon_search",
  ];
  return createTestMcpServer({
    name: "filter-server",
    tools: toolNames.map((name) => ({
      name,
      description: `Filter test tool: ${name}`,
      handler: () => ({
        content: [{ type: "text", text: `result from ${name}` }],
      }),
    })),
  });
}

/**
 * Server with a tool that returns mixed text + image content.
 */
export function createMultiContentServer(): Promise<TestMcpServer> {
  return createTestMcpServer({
    name: "multi-content-server",
    tools: [
      {
        name: "get_chart",
        description: "Returns text summary and a chart image",
        handler: () => ({
          content: [
            { type: "text", text: "Chart summary: sales are up 15%" },
            {
              type: "image",
              data: "iVBORw0KGgo=",
              mimeType: "image/png",
            },
          ],
        }),
      },
    ],
  });
}

/**
 * Server with a tool that captures _meta for verifying userId forwarding.
 */
export function createMetaCaptureServer(): Promise<TestMcpServer> {
  const capturedMeta: Record<string, unknown>[] = [];
  const server = createTestMcpServer({
    name: "meta-capture-server",
    tools: [
      {
        name: "capture_meta",
        description: "Captures _meta from the request",
        handler: () => ({
          content: [{ type: "text", text: "captured" }],
        }),
      },
    ],
  });
  return server.then((s) => Object.assign(s, { capturedMeta }));
}
