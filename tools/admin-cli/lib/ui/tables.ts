import Table from "cli-table3";
import { estimateModelMemory, formatMemorySize } from "../engine/memory.js";
import type { Model, ProviderConfig } from "../types/index.js";
import {
  colors,
  formatAuthType,
  formatDialect,
  formatEngine,
  formatProvider,
  formatStatus,
  formatSuitability,
} from "./colors.js";

interface ModelWithId {
  id: string;
  model: Model;
}

interface ActiveModels {
  backend?: ModelWithId;
  workers?: ModelWithId;
}

interface ValidationIssue {
  type: "error" | "warning";
  message: string;
}

interface ModelsTableOptions {
  showMemory?: boolean;
}

/**
 * Create a models table
 */
export function createModelsTable(
  models: ModelWithId[],
  activeModels: ActiveModels = {},
  options: ModelsTableOptions = {},
): string {
  const headers = [
    colors.header("ID"),
    colors.header("Provider"),
    colors.header("Name"),
    colors.header("Provider Model"),
    colors.header("Context"),
    colors.header("Status"),
  ];

  if (options.showMemory) {
    headers.push(colors.header("Est. Memory"));
  }

  const table = new Table({
    head: headers,
    style: {
      head: [],
      border: ["gray"],
    },
  });

  // Helper to check if model is active
  function isModelActive(modelId: string): boolean {
    return (
      activeModels.backend?.id === modelId ||
      activeModels.workers?.id === modelId
    );
  }

  models.forEach(({ id, model }) => {
    const isActive = isModelActive(id);

    const row: string[] = [
      colors.emphasis(id),
      formatProvider(model.provider),
      model.name,
      colors.dim(model.providerModel),
      formatSuitability(model),
      formatStatus(isActive),
    ];

    if (options.showMemory) {
      if (model.source?.sizeBytes && model.source.format === "gguf") {
        // Use model's contextWindow instead of hardcoded default
        const contextSize = model.capabilities?.contextWindow ?? 8192;
        const estimate = estimateModelMemory(
          model.source.sizeBytes,
          contextSize,
          model.source.architecture,
          model.source.visionSizeBytes,
        );
        row.push(`~${formatMemorySize(estimate.total)}`);
      } else {
        row.push(colors.dim("-"));
      }
    }

    table.push(row);
  });

  return table.toString();
}

/**
 * Create a simple key-value table
 */
export function createInfoTable(data: Record<string, string>): string {
  const table = new Table({
    style: {
      head: [],
      border: ["gray"],
    },
  });

  for (const [key, value] of Object.entries(data)) {
    const displayKey = colors.emphasis(key);
    const displayValue =
      typeof value === "object"
        ? JSON.stringify(value, null, 2)
        : String(value);

    table.push([displayKey, displayValue]);
  }

  return table.toString();
}

/**
 * Create an active models summary table
 */
export function createActiveModelsTable(
  activeModels: ActiveModels,
  allModels: ModelWithId[],
): string {
  const table = new Table({
    head: [
      colors.header("Context"),
      colors.header("Provider"),
      colors.header("Model ID"),
      colors.header("Name"),
      colors.header("Status"),
    ],
    style: {
      head: [],
      border: ["gray"],
    },
  });

  const contexts: (keyof ActiveModels)[] = ["backend", "workers"];

  contexts.forEach((context) => {
    const active = activeModels[context];
    if (active) {
      // Verify the model still exists in the models list
      const modelExists = allModels.some((m) => m.id === active.id);
      const status = modelExists
        ? formatStatus(true)
        : colors.error("NOT FOUND");

      table.push([
        colors.emphasis(context),
        formatProvider(active.model.provider),
        active.id,
        active.model.name,
        status,
      ]);
    } else {
      table.push([
        colors.emphasis(context),
        colors.dim("-"),
        colors.dim("-"),
        colors.dim("No active model"),
        colors.warning("NONE"),
      ]);
    }
  });

  return table.toString();
}

/**
 * Create a validation issues table
 */
export function createIssuesTable(issues: ValidationIssue[]): string {
  if (issues.length === 0) {
    return colors.success("\u2705 No issues found");
  }

  const table = new Table({
    head: [colors.header("Type"), colors.header("Issue")],
    style: {
      head: [],
      border: ["gray"],
    },
  });

  issues.forEach((issue) => {
    const typeColor = issue.type === "error" ? colors.error : colors.warning;
    table.push([typeColor(issue.type.toUpperCase()), issue.message]);
  });

  return table.toString();
}

/**
 * Create a providers table
 */
export function createProvidersTable(
  providers: Record<string, ProviderConfig>,
): string {
  const table = new Table({
    head: [
      colors.header("ID"),
      colors.header("Engine"),
      colors.header("Dialect"),
      colors.header("Base URL"),
      colors.header("Auth"),
    ],
    style: {
      head: [],
      border: ["gray"],
    },
  });

  for (const [id, config] of Object.entries(providers)) {
    table.push([
      colors.emphasis(id),
      formatEngine(config.engine),
      formatDialect(config.dialect),
      colors.dim(config.baseUrl),
      formatAuthType(config.auth.type),
    ]);
  }

  return table.toString();
}

/**
 * Create a provider info table (key-value format)
 */
export function createProviderInfoTable(
  id: string,
  config: ProviderConfig,
): string {
  const table = new Table({
    style: {
      head: [],
      border: ["gray"],
    },
  });

  table.push([colors.emphasis("ID"), id]);
  table.push([colors.emphasis("Engine"), formatEngine(config.engine)]);
  table.push([colors.emphasis("Dialect"), formatDialect(config.dialect)]);
  table.push([colors.emphasis("Base URL"), config.baseUrl]);

  table.push([colors.emphasis("Auth Type"), formatAuthType(config.auth.type)]);

  if (config.auth.header) {
    table.push([colors.emphasis("Auth Header"), config.auth.header]);
  }

  if (config.auth.value) {
    // Mask the auth value (show first 8 chars and last 4)
    const value = config.auth.value;
    const maskedValue =
      value.length > 12
        ? `${value.substring(0, 8)}...${value.slice(-4)}`
        : "***";
    table.push([colors.emphasis("Auth Value"), colors.dim(maskedValue)]);
  }

  if (config.headers && Object.keys(config.headers).length > 0) {
    table.push([
      colors.emphasis("Headers"),
      colors.dim(JSON.stringify(config.headers)),
    ]);
  }

  if (config.overrides) {
    table.push([
      colors.emphasis("Overrides"),
      colors.dim(JSON.stringify(config.overrides)),
    ]);
  }

  return table.toString();
}
