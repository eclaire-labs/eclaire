import { createInfoTable } from "../../ui/tables.js";
import { colors, icons } from "../../ui/colors.js";

const ENV_VARS = [
  { key: "DATABASE_TYPE", secret: false },
  { key: "DATABASE_URL", secret: true },
  { key: "DATABASE_HOST", secret: false },
  { key: "DATABASE_PORT", secret: false },
  { key: "DATABASE_NAME", secret: false },
  { key: "QUEUE_BACKEND", secret: false },
  { key: "SERVICE_ROLE", secret: false },
  { key: "ECLAIRE_RUNTIME", secret: false },
  { key: "ECLAIRE_HOME", secret: false },
  { key: "PORT", secret: false },
  { key: "NODE_ENV", secret: false },
  { key: "LOG_LEVEL", secret: false },
  { key: "MASTER_ENCRYPTION_KEY", secret: true },
  { key: "BETTER_AUTH_SECRET", secret: true },
  { key: "LLAMA_CPP_BASE_URL", secret: false },
  { key: "OLLAMA_BASE_URL", secret: false },
  { key: "OPENAI_API_KEY", secret: true },
  { key: "ANTHROPIC_API_KEY", secret: true },
  { key: "OPENROUTER_API_KEY", secret: true },
  { key: "WORKER_CONCURRENCY", secret: false },
  { key: "AI_TIMEOUT", secret: false },
];

function maskSecret(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.substring(0, 4)}...${value.slice(-4)}`;
}

export async function envCommand(): Promise<void> {
  // Load .env first
  await import("@eclaire/core/env-loader");

  console.log(colors.header(`\n  ${icons.gear} Environment Variables\n`));

  const data: Record<string, string> = {};
  for (const { key, secret } of ENV_VARS) {
    const value = process.env[key];
    if (value) {
      data[key] = secret ? maskSecret(value) : value;
    } else {
      data[key] = colors.dim("(not set)");
    }
  }

  console.log(createInfoTable(data));
  console.log();
}
