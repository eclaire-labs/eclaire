import axios, { type AxiosError } from "axios";
import ora from "ora";
import { getProviderById } from "../../config/providers.js";
import type {
  CommandOptions,
  Dialect,
  ProviderConfig,
} from "../../types/index.js";
import { colors, icons } from "../../ui/colors.js";

interface TestResult {
  success: boolean;
  status?: number;
  latencyMs?: number;
  error?: string;
  errorType?: "connection" | "auth" | "timeout" | "server" | "unknown";
}

/**
 * Get the endpoint path for a dialect
 */
function getEndpointForDialect(dialect: Dialect): string {
  switch (dialect) {
    case "openai_compatible":
      return "/chat/completions";
    case "mlx_native":
      return "/responses";
    case "anthropic_messages":
      return "/v1/messages";
    default:
      return "/chat/completions";
  }
}

export async function testCommand(
  id: string,
  options: CommandOptions,
): Promise<void> {
  try {
    const timeout = parseInt(options.timeout || "5000", 10);

    const provider = getProviderById(id);
    if (!provider) {
      console.log(colors.error(`${icons.error} Provider not found: ${id}`));
      process.exit(1);
    }

    console.log(colors.header(`${icons.gear} Testing Provider: ${id}\n`));
    console.log(colors.dim(`Base URL: ${provider.baseUrl}`));
    console.log(colors.dim(`Dialect: ${provider.dialect}`));
    console.log(colors.dim(`Auth: ${provider.auth.type}\n`));

    const spinner = ora("Testing connectivity...").start();

    const result = await testProviderConnectivity(provider, timeout);

    if (result.success) {
      spinner.succeed(colors.success("Connection successful"));
      console.log(
        colors.success(`\n${icons.success} Status: ${result.status}`),
      );
      console.log(colors.info(`${icons.info} Latency: ${result.latencyMs}ms`));
    } else {
      spinner.fail(colors.error("Connection failed"));

      // Provide helpful error messages based on error type
      switch (result.errorType) {
        case "connection":
          console.log(
            colors.error(
              `\n${icons.error} Cannot connect to ${provider.baseUrl}`,
            ),
          );
          console.log(colors.dim("\nPossible causes:"));
          console.log(colors.dim("  - Server is not running"));
          console.log(colors.dim("  - Wrong port number"));
          console.log(colors.dim("  - Firewall blocking connection"));
          console.log(colors.dim("  - Incorrect base URL"));
          break;

        case "auth":
          console.log(
            colors.error(
              `\n${icons.error} Authentication failed (${result.status})`,
            ),
          );
          console.log(colors.dim("\nPossible causes:"));
          console.log(colors.dim("  - Invalid or expired API key"));
          console.log(colors.dim("  - Wrong auth type configured"));
          console.log(
            colors.dim("  - API key not authorized for this endpoint"),
          );
          break;

        case "timeout":
          console.log(
            colors.error(
              `\n${icons.error} Request timed out after ${timeout}ms`,
            ),
          );
          console.log(colors.dim("\nPossible causes:"));
          console.log(colors.dim("  - Server is unresponsive"));
          console.log(colors.dim("  - Network latency issues"));
          console.log(colors.dim("  - Server under heavy load"));
          break;

        case "server":
          console.log(
            colors.error(`\n${icons.error} Server error (${result.status})`),
          );
          console.log(colors.dim(`\nError: ${result.error}`));
          console.log(
            colors.dim("\nThe server is reachable but returned an error."),
          );
          break;

        default:
          console.log(colors.error(`\n${icons.error} ${result.error}`));
      }

      process.exit(1);
    }
  } catch (error: any) {
    console.log(
      colors.error(`${icons.error} Failed to test provider: ${error.message}`),
    );
    process.exit(1);
  }
}

async function testProviderConnectivity(
  provider: ProviderConfig,
  timeout: number,
): Promise<TestResult> {
  const startTime = Date.now();

  // Build the URL - derive endpoint from dialect
  const endpoint =
    provider.overrides?.chatPath ?? getEndpointForDialect(provider.dialect);
  const url = `${provider.baseUrl}${endpoint}`;

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "eclaire-cli/1.0.0",
    ...provider.headers,
  };

  // Add auth header if needed (using new format)
  if (
    provider.auth.type !== "none" &&
    provider.auth.header &&
    provider.auth.value
  ) {
    headers[provider.auth.header] = provider.auth.value;
  }

  // Create a minimal valid request body
  // Most providers accept this and will respond (even if with an error about missing model)
  const testBody: Record<string, any> = {
    messages: [{ role: "user", content: "test" }],
    max_tokens: 1,
    stream: false,
    model: "test",
  };

  try {
    const response = await axios.post(url, testBody, {
      headers,
      timeout,
      validateStatus: () => true, // Accept any status for analysis
    });

    const latencyMs = Date.now() - startTime;

    // 200-299: Success
    // 400-499: Client error (but server is reachable)
    // 500-599: Server error

    if (response.status >= 200 && response.status < 500) {
      // Server is responding - even 4xx means connectivity works
      // (400 might just mean our test request was invalid, which is fine)
      return {
        success: true,
        status: response.status,
        latencyMs,
      };
    }

    // Server errors
    return {
      success: false,
      status: response.status,
      latencyMs,
      error:
        response.data?.error?.message ||
        response.data?.detail ||
        "Server error",
      errorType: "server",
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (
        axiosError.code === "ECONNREFUSED" ||
        axiosError.code === "ENOTFOUND"
      ) {
        return {
          success: false,
          latencyMs,
          error: `Cannot connect to ${url}`,
          errorType: "connection",
        };
      }

      if (
        axiosError.code === "ETIMEDOUT" ||
        axiosError.code === "ECONNABORTED"
      ) {
        return {
          success: false,
          latencyMs,
          error: "Request timed out",
          errorType: "timeout",
        };
      }

      if (
        axiosError.response?.status === 401 ||
        axiosError.response?.status === 403
      ) {
        return {
          success: false,
          status: axiosError.response.status,
          latencyMs,
          error: "Authentication failed",
          errorType: "auth",
        };
      }
    }

    return {
      success: false,
      latencyMs,
      error: error instanceof Error ? error.message : "Unknown error",
      errorType: "unknown",
    };
  }
}
