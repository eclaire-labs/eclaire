// Re-export from shared env loader
// This file exists for backwards compatibility - all env loading logic is in @eclaire/core
//
// Importing @eclaire/core triggers environment loading as a side effect
// (via the env-loader module), then re-exports the info objects.

export { ENV_LOADED, envLoadInfo } from "@eclaire/core";
