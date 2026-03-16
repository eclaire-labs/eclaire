import { getMcpServer, createMcpServer } from "../../db/mcp-servers.js";
import { closeDb } from "../../db/index.js";
import { colors, icons } from "../../ui/colors.js";
import {
  intro,
  outro,
  cancel,
  note,
  textInput,
  selectOne,
  confirm,
  isCancelled,
  CancelledError,
} from "../../ui/clack.js";

export async function addCommand(): Promise<void> {
  try {
    intro(`${icons.server} Add MCP Server`);

    // 1. ID
    const id = await textInput({
      message: "Server ID (lowercase, hyphens allowed)",
      placeholder: "my-mcp-server",
      validate: (value: string) => {
        if (!value || value.trim().length === 0) {
          return "Server ID is required";
        }
        if (!/^[a-z0-9-]+$/.test(value)) {
          return "ID can only contain lowercase letters, numbers, and hyphens";
        }
      },
    });

    // Check uniqueness
    const existing = await getMcpServer(id);
    if (existing) {
      cancel(`Server ID "${id}" already exists`);
      await closeDb();
      process.exit(1);
    }

    // 2. Name
    const name = await textInput({
      message: "Display name",
      placeholder: "My MCP Server",
      validate: (value: string) => {
        if (!value || value.trim().length === 0) {
          return "Name is required";
        }
      },
    });

    // 3. Description (optional)
    const description = await textInput({
      message: "Description (optional)",
      placeholder: "What does this server do?",
    });

    // 4. Transport
    const transport = await selectOne<string>({
      message: "Transport type",
      options: [
        {
          value: "stdio",
          label: "stdio",
          hint: "Local process via stdin/stdout",
        },
        { value: "sse", label: "sse", hint: "Server-Sent Events over HTTP" },
        { value: "http", label: "http", hint: "Streamable HTTP" },
      ],
    });

    let command: string | null = null;
    let args: string[] | null = null;

    // 5. Transport-specific config
    if (transport === "stdio") {
      command = await textInput({
        message: "Command to run",
        placeholder: "npx",
        validate: (value: string) => {
          if (!value || value.trim().length === 0) {
            return "Command is required for stdio transport";
          }
        },
      });

      const argsRaw = await textInput({
        message: "Arguments (space-separated)",
        placeholder: "-y @modelcontextprotocol/server-filesystem /tmp",
      });

      if (argsRaw.trim().length > 0) {
        args = argsRaw.trim().split(/\s+/);
      }
    } else {
      // sse or http
      command = await textInput({
        message: "Server URL",
        placeholder:
          transport === "sse"
            ? "http://localhost:3001/sse"
            : "http://localhost:3001/mcp",
        validate: (value: string) => {
          if (!value || value.trim().length === 0) {
            return "URL is required for this transport";
          }
          try {
            new URL(value);
          } catch {
            return "Must be a valid URL";
          }
        },
      });
    }

    // 6. Connect timeout
    const timeoutRaw = await textInput({
      message: "Connect timeout in ms (optional, leave empty for none)",
      placeholder: "30000",
    });
    const connectTimeout =
      timeoutRaw.trim().length > 0 ? Number.parseInt(timeoutRaw, 10) : null;
    if (connectTimeout !== null && Number.isNaN(connectTimeout)) {
      cancel("Timeout must be a number");
      await closeDb();
      process.exit(1);
    }

    // 7. Tool mode
    const toolMode = await selectOne<string>({
      message: "Tool mode",
      options: [
        {
          value: "managed",
          label: "managed",
          hint: "Eclaire manages which tools are exposed",
        },
        {
          value: "auto",
          label: "auto",
          hint: "All tools from this server are available automatically",
        },
      ],
    });

    // 8. Summary
    const summaryLines = [
      `ID:          ${id}`,
      `Name:        ${name}`,
      `Description: ${description || "(none)"}`,
      `Transport:   ${transport}`,
      transport === "stdio"
        ? `Command:     ${command}`
        : `URL:         ${command}`,
      transport === "stdio" && args ? `Args:        ${args.join(" ")}` : null,
      `Timeout:     ${connectTimeout ? `${connectTimeout}ms` : "(none)"}`,
      `Tool Mode:   ${toolMode}`,
    ]
      .filter(Boolean)
      .join("\n");

    note(summaryLines, "New MCP Server");

    // 9. Confirm
    const proceed = await confirm({
      message: "Add this MCP server?",
      initialValue: true,
    });

    if (!proceed) {
      cancel("Cancelled");
      await closeDb();
      return;
    }

    // 10. Insert
    await createMcpServer({
      id,
      name,
      description: description || null,
      transport,
      command,
      args,
      connectTimeout,
      toolMode,
    });
    await closeDb();

    outro(
      colors.success(`${icons.success} MCP server "${id}" added successfully!`),
    );
  } catch (error: unknown) {
    if (isCancelled(error) || error instanceof CancelledError) {
      cancel("Cancelled");
      await closeDb();
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      colors.error(`${icons.error} Failed to add MCP server: ${message}`),
    );
    await closeDb();
    process.exit(1);
  }
}
