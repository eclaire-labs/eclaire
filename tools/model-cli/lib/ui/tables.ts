import Table from 'cli-table3';
import { colors, formatStatus, formatProvider, formatContext, truncateString, formatMLX } from './colors.js';
import { Model, ModelsConfig } from '../types/index.js';

interface ActiveModel {
  provider: string;
  modelShortName: string;
}

interface ActiveModels {
  backend?: ActiveModel;
  workers?: ActiveModel;
}

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
}

/**
 * Create a models table
 */
export function createModelsTable(models: Model[], activeModels: ActiveModels = {}): string {
  const table = new Table({
    head: [
      colors.header('ID'),
      colors.header('Provider'),
      colors.header('MLX'),
      colors.header('Short Name'),
      colors.header('Full Name'),
      colors.header('Context'),
      colors.header('Status')
    ],
    // Auto-size columns based on content - no colWidths specified
    style: {
      head: [],
      border: ['gray']
    }
  });

  // Helper to check if model is active
  function isModelActive(model: Model): boolean {
    return Object.values(activeModels).some((active: ActiveModel | undefined) =>
      active &&
      active.provider === model.provider &&
      active.modelShortName === model.modelShortName
    );
  }

  // Helper to check if model is MLX
  function isMLXModel(model: Model): boolean {
    // Check if model has 'mlx' tag in metadata
    if (model.metadata?.tags && Array.isArray(model.metadata.tags)) {
      return model.metadata.tags.includes('mlx');
    }
    // For OpenRouter models, could check architecture if needed
    return false;
  }

  models.forEach(model => {
    const isActive = isModelActive(model);
    const isMLX = isMLXModel(model);

    table.push([
      colors.emphasis(model.id),
      formatProvider(model.provider),
      formatMLX(isMLX),
      model.modelShortName,
      model.modelFullName || model.modelShortName, // No truncation - auto-sizing handles it
      formatContext(model.contexts),
      formatStatus(isActive)
    ]);
  });

  return table.toString();
}

/**
 * Create a simple key-value table
 */
export function createInfoTable(data: Record<string, any>): string {
  const table = new Table({
    // Remove fixed column widths to prevent truncation - let cli-table3 auto-size
    style: {
      head: [],
      border: ['gray']
    }
  });

  for (const [key, value] of Object.entries(data)) {
    // Use the key as-is without adding spaces to avoid formatting issues
    const displayKey = colors.emphasis(key);
    const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);

    table.push([displayKey, displayValue]);
  }

  return table.toString();
}

/**
 * Create an active models summary table
 */
export function createActiveModelsTable(activeModels: ActiveModels, allModels: Model[]): string {
  const table = new Table({
    head: [
      colors.header('Context'),
      colors.header('Provider'),
      colors.header('Short Name'),
      colors.header('Status')
    ],
    // Auto-size columns based on content
    style: {
      head: [],
      border: ['gray']
    }
  });

  const contexts: (keyof ActiveModels)[] = ['backend', 'workers'];

  contexts.forEach(context => {
    const active = activeModels[context];
    if (active) {
      const model = allModels.find(m =>
        m.provider === active.provider &&
        m.modelShortName === active.modelShortName
      );

      const status = model ? formatStatus(true) : colors.error('NOT FOUND');

      table.push([
        colors.emphasis(context),
        formatProvider(active.provider),
        active.modelShortName, // No truncation
        status
      ]);
    } else {
      table.push([
        colors.emphasis(context),
        colors.dim('—'),
        colors.dim('No active model'),
        colors.warning('NONE')
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
    return colors.success('✅ No issues found');
  }

  const table = new Table({
    head: [
      colors.header('Type'),
      colors.header('Issue')
    ],
    // Auto-size columns based on content
    style: {
      head: [],
      border: ['gray']
    }
  });

  issues.forEach(issue => {
    const typeColor = issue.type === 'error' ? colors.error : colors.warning;
    table.push([
      typeColor(issue.type.toUpperCase()),
      issue.message
    ]);
  });

  return table.toString();
}