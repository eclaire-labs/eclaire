export const BASE_URL = "http://localhost:3001/api";
export const TEST_API_KEY =
  "sk-demouserkey0001-testSecretDemoUser12345678901234";
export const TEST_API_KEY_2 =
  "sk-demouserkey0002-testSecretDemoUser22345678901234";
export const DEMO_EMAIL = "demo@example.com";
export const DEMO_PASSWORD = "Demo@123";
export const DEMO_API_KEY =
  "sk-demouserkey0001-testSecretDemoUser12345678901234";

export const VERBOSE = process.env.VERBOSE === "true" || false;

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const logger = {
  request: (
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: any,
  ) => {
    if (!VERBOSE) return;
    console.log("\n📤 REQUEST:");
    console.log(`${method} ${url}`);
    console.log("Headers:", JSON.stringify(headers, null, 2));
    if (body) {
      console.log("Body:", JSON.stringify(body, null, 2));
    }
  },
  response: async (response: Response) => {
    if (!VERBOSE) return;

    console.log("\n📥 RESPONSE:");
    console.log(`Status: ${response.status} (${response.statusText})`);
    console.log(
      "Headers:",
      JSON.stringify(Object.fromEntries([...response.headers]), null, 2),
    );

    const clonedResponse = response.clone();
    try {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const json = await clonedResponse.json();
        console.log("Body:", JSON.stringify(json, null, 2));
      } else {
        const text = await clonedResponse.text();
        if (text) console.log("Body:", text);
      }
    } catch (error) {
      console.log("Could not parse response body");
    }

    console.log("-----------------------------------");
  },
};

export const createAuthenticatedFetch = (apiKey: string = TEST_API_KEY) => {
  return async (url: string, options: RequestInit = {}) => {
    const method = options.method || "GET";
    const headers: Record<string, string> = {
      "User-Agent": "integration-test/1.0.0",
      Authorization: `Bearer ${apiKey}`,
      ...((options.headers as Record<string, string>) || {}),
    };

    // Only set default Content-Type to application/json if body is not FormData
    // and if Content-Type wasn't explicitly provided
    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    logger.request(method, url, headers, options.body);

    const response = await fetch(url, {
      ...options,
      headers,
    });

    await logger.response(response);

    return response;
  };
};

export function hasSameElements(
  arr1: string[] | null,
  arr2: string[] | null,
): boolean {
  if (arr1 === null || arr2 === null) {
    return arr1 === arr2;
  }

  if (arr1.length !== arr2.length) return false;

  const set1 = new Set(arr1);
  return arr2.every((item) => set1.has(item));
}
