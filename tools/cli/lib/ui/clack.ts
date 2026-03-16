/**
 * @clack/prompts wrapper with automatic cancellation handling.
 * All prompt functions throw CancelledError on Ctrl+C,
 * so command handlers can catch it uniformly.
 */

import * as p from "@clack/prompts";

export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

function assertNotCancelled<T>(value: T | symbol): T {
  if (p.isCancel(value)) throw new CancelledError();
  return value;
}

/** Check if an error is a user cancellation */
export function isCancelled(error: unknown): error is CancelledError {
  return error instanceof CancelledError;
}

// Re-export layout primitives
export const intro = p.intro;
export const outro = p.outro;
export const cancel = p.cancel;
export const note = p.note;
export const log = p.log;
export const spinner = p.spinner;

// Wrapped prompt functions with auto-cancel detection

export async function textInput(opts: {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string) => string | undefined;
}): Promise<string> {
  // Cast validate to match @clack/prompts' broader signature
  return assertNotCancelled(await p.text(opts as Parameters<typeof p.text>[0]));
}

export async function passwordInput(opts: {
  message: string;
  validate?: (value: string) => string | undefined;
}): Promise<string> {
  return assertNotCancelled(
    await p.password(opts as Parameters<typeof p.password>[0]),
  );
}

export async function selectOne<T>(opts: {
  message: string;
  options: { value: T; label: string; hint?: string }[];
}): Promise<T> {
  // biome-ignore lint/suspicious/noExplicitAny: Option type conditional generics are hard to satisfy
  const result = await p.select(opts as any);
  return assertNotCancelled(result) as T;
}

export async function selectMany<T>(opts: {
  message: string;
  options: { value: T; label: string; hint?: string }[];
  required?: boolean;
}): Promise<T[]> {
  // biome-ignore lint/suspicious/noExplicitAny: Option type conditional generics are hard to satisfy
  const result = await p.multiselect(opts as any);
  return assertNotCancelled(result) as T[];
}

export async function confirm(opts: {
  message: string;
  initialValue?: boolean;
}): Promise<boolean> {
  return assertNotCancelled(await p.confirm(opts));
}
