import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../../config/index.js";

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

export function resolveBrowserCommand(command: string): string | null {
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return fs.existsSync(command) ? command : null;
  }

  const candidates = new Set<string>();
  const pathEntries = (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);

  for (const entry of pathEntries) {
    candidates.add(path.join(entry, command));
  }

  candidates.add(path.join(config.home, "node_modules", ".bin", command));
  candidates.add(path.join(process.cwd(), "node_modules", ".bin", command));
  candidates.add(
    path.join(
      process.cwd(),
      "apps",
      "backend",
      "node_modules",
      ".bin",
      command,
    ),
  );
  candidates.add(path.join(PACKAGE_ROOT, "node_modules", ".bin", command));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
