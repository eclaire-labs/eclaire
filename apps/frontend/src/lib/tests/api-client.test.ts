import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiDelete,
  apiFetch,
  apiGet,
  apiPost,
  apiPut,
  normalizeApiUrl,
} from "@/lib/api-client";

// Mock window.location for auth error tests
const mockLocation = {
  pathname: "/dashboard",
  origin: "http://localhost:3000",
  href: "",
};
vi.stubGlobal("window", { location: mockLocation });

describe("apiFetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
    mockLocation.href = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prepends / to endpoint if missing", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await apiFetch("api/test");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("preserves / prefix on endpoint", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await apiFetch("/api/test");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("sets Content-Type to application/json for JSON body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await apiFetch("/api/test", {
      method: "POST",
      body: JSON.stringify({ key: "value" }),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("does NOT set Content-Type for FormData body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const formData = new FormData();
    formData.append("file", "test");
    await apiFetch("/api/upload", { method: "POST", body: formData });
    const callHeaders = fetchMock.mock.calls[0]![1].headers;
    expect(callHeaders["Content-Type"]).toBeUndefined();
  });

  it("sets credentials to include", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await apiFetch("/api/test");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("returns response on 200", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const response = await apiFetch("/api/test");
    expect(response.status).toBe(200);
  });

  it("throws on 401 without retry", async () => {
    fetchMock.mockResolvedValue(
      new Response("unauthorized", { status: 401 }),
    );
    await expect(apiFetch("/api/test")).rejects.toThrow(
      "Authentication required",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on 4xx without retry", async () => {
    // Empty statusText ensures the default error message pattern is preserved,
    // which the catch block uses to detect 4xx errors and skip retries
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response("", { status: 400 })),
    );
    await expect(apiFetch("/api/test")).rejects.toThrow(
      "Request failed with status 400",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("apiGet", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("sends a GET request", async () => {
    await apiGet("/api/items");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("apiPost", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("sends a POST request with JSON body", async () => {
    await apiPost("/api/items", { title: "test" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "test" }),
      }),
    );
  });

  it("sends FormData as-is", async () => {
    const formData = new FormData();
    formData.append("file", "content");
    await apiPost("/api/upload", formData);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/upload",
      expect.objectContaining({
        method: "POST",
        body: formData,
      }),
    );
  });
});

describe("apiPut", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("sends a PUT request with JSON body", async () => {
    await apiPut("/api/items/1", { title: "updated" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items/1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ title: "updated" }),
      }),
    );
  });
});

describe("apiDelete", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("sends a DELETE request", async () => {
    await apiDelete("/api/items/1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items/1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("normalizeApiUrl", () => {
  it("returns empty string for empty input", () => {
    expect(normalizeApiUrl("")).toBe("");
  });

  it("returns absolute URL as-is (http)", () => {
    expect(normalizeApiUrl("http://example.com/api/test")).toBe(
      "http://example.com/api/test",
    );
  });

  it("returns absolute URL as-is (https)", () => {
    expect(normalizeApiUrl("https://example.com/api/test")).toBe(
      "https://example.com/api/test",
    );
  });

  it("prepends / if missing on relative URL", () => {
    expect(normalizeApiUrl("api/test")).toBe("/api/test");
  });

  it("preserves / on relative URL", () => {
    expect(normalizeApiUrl("/api/test")).toBe("/api/test");
  });
});
