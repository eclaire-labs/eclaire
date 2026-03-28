import { describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
} from "../utils/test-helpers.js";

interface AgentStepResponse {
  id: string;
  stepNumber: number;
  timestamp: string;
  isTerminal: boolean;
  textContent?: string | null;
  thinkingContent?: string | null;
  toolExecutions?: unknown[] | null;
}

interface StepsListResponse {
  items: AgentStepResponse[];
}

describe("Agent Steps API Integration Tests", () => {
  const authenticatedFetch = createAuthenticatedFetch(TEST_API_KEY);

  describe("GET /api/sessions/:id/messages/:messageId/steps", () => {
    it("returns 404 for non-existent session", async () => {
      await delay(200);

      const response = await authenticatedFetch(
        `${BASE_URL}/sessions/conv-nonexistent-xyz/messages/msg-1/steps`,
      );

      expect(response.status).toBe(404);
    });

    it("returns empty items for a valid session with non-existent messageId", async () => {
      // Create a session first
      const createRes = await authenticatedFetch(`${BASE_URL}/sessions`, {
        method: "POST",
        body: JSON.stringify({
          prompt: "Hello, just testing session creation.",
        }),
      });

      // The session might be created via prompt or directly — handle both
      if (createRes.status === 200 || createRes.status === 201) {
        const session = (await createRes.json()) as {
          id?: string;
          sessionId?: string;
        };
        const sessionId = session.id ?? session.sessionId;

        if (sessionId) {
          // Query steps for a bogus message in this real session
          const stepsRes = await authenticatedFetch(
            `${BASE_URL}/sessions/${sessionId}/messages/msg-bogus-xyz/steps`,
          );

          expect(stepsRes.status).toBe(200);
          const data = (await stepsRes.json()) as StepsListResponse;
          expect(data.items).toEqual([]);
        }
      }
    });

    it("unauthenticated request returns 401", async () => {
      const response = await fetch(
        `${BASE_URL}/sessions/conv-1/messages/msg-1/steps`,
      );

      expect(response.status).toBe(401);
    });
  });
});
