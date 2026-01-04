/**
 * Dialect Adapter Types
 *
 * Defines the interface for dialect adapters that transform
 * requests and responses between the unified format and
 * provider-specific formats.
 */

import type {
  AdapterRequest,
  AdapterRequestParams,
  AdapterResponse,
  Dialect,
  ProviderAuth,
} from "../types.js";

/**
 * Dialect adapter interface
 *
 * Each dialect adapter knows how to:
 * - Build request bodies for a specific API format
 * - Parse responses into the unified format
 * - Transform streaming responses
 */
export interface DialectAdapter {
  /**
   * The dialect this adapter handles
   */
  readonly dialect: Dialect;

  /**
   * Build the HTTP request for the provider
   *
   * @param baseUrl - Provider base URL
   * @param endpoint - API endpoint path
   * @param params - Request parameters
   * @param auth - Authentication configuration
   * @param headers - Custom headers from provider config
   */
  buildRequest(
    baseUrl: string,
    endpoint: string,
    params: AdapterRequestParams,
    auth: ProviderAuth,
    headers?: Record<string, string>
  ): AdapterRequest;

  /**
   * Parse a non-streaming response from the provider
   *
   * @param response - Raw JSON response from provider
   */
  parseResponse(response: unknown): AdapterResponse;

  /**
   * Transform a streaming response to the unified SSE format
   *
   * @param stream - Raw byte stream from provider
   */
  transformStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array>;
}

/**
 * Adapter registry type
 */
export type AdapterRegistry = Record<Dialect, DialectAdapter>;
