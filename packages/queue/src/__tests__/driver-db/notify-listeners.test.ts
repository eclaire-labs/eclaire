/**
 * B7: Notify Listener Semantics (per-callback unsubscribe)
 *
 * Tests that the notification system correctly handles per-callback
 * unsubscribe semantics. When one callback is unsubscribed, other
 * callbacks for the same queue should continue to receive notifications.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createTestLogger,
  sleep,
} from "../testkit/index.js";
import {
  createInMemoryNotify,
  createPollingNotifyListener,
  createPgNotifyListener,
  type PgClient,
  type PgNotification,
} from "../../driver-db/index.js";

describe("B7: Notify Listener Semantics", () => {
  const logger = createTestLogger();

  describe("B7.1: in-memory notify - unsubscribe removes only one callback", () => {
    it("should only fire remaining callback after unsubscribe", async () => {
      // 1. Create in-memory notify pair
      const { emitter, listener } = createInMemoryNotify({ logger });

      const callback1Fired: string[] = [];
      const callback2Fired: string[] = [];

      // 2. Subscribe two callbacks to same queue name
      const unsubscribe1 = listener.subscribe("test-queue", () => {
        callback1Fired.push("fired");
      });

      listener.subscribe("test-queue", () => {
        callback2Fired.push("fired");
      });

      // 3. Unsubscribe only callback1
      unsubscribe1();

      // 4. Emit notification
      await emitter.emit("test-queue");

      // Wait for setImmediate to process
      await sleep(50);

      // 5. Assert callback2 fired, callback1 did not
      expect(callback1Fired.length).toBe(0);
      expect(callback2Fired.length).toBe(1);

      // Cleanup
      await listener.close();
      await emitter.close();
    });

    it("should fire all callbacks when none unsubscribed", async () => {
      const { emitter, listener } = createInMemoryNotify({ logger });

      let callback1Count = 0;
      let callback2Count = 0;

      listener.subscribe("test-queue", () => {
        callback1Count++;
      });

      listener.subscribe("test-queue", () => {
        callback2Count++;
      });

      await emitter.emit("test-queue");
      await sleep(50);

      expect(callback1Count).toBe(1);
      expect(callback2Count).toBe(1);

      await listener.close();
      await emitter.close();
    });

    it("should isolate callbacks by queue name", async () => {
      const { emitter, listener } = createInMemoryNotify({ logger });

      let queueACount = 0;
      let queueBCount = 0;

      listener.subscribe("queue-a", () => {
        queueACount++;
      });

      listener.subscribe("queue-b", () => {
        queueBCount++;
      });

      await emitter.emit("queue-a");
      await sleep(50);

      expect(queueACount).toBe(1);
      expect(queueBCount).toBe(0);

      await listener.close();
      await emitter.close();
    });
  });

  describe("B7.2: polling notify - subscribe fires periodically, unsubscribe stops", () => {
    it("should fire callback periodically", async () => {
      // 1. Create polling listener with short interval
      const listener = createPollingNotifyListener({
        logger,
        pollInterval: 30, // 30ms
      });

      let fireCount = 0;

      // 2. Subscribe callback
      listener.subscribe("test-queue", () => {
        fireCount++;
      });

      // 3. Wait for > 2 intervals
      await sleep(100);

      // 4. Should have fired at least twice
      expect(fireCount).toBeGreaterThanOrEqual(2);

      await listener.close();
    });

    it("should stop firing after unsubscribe", async () => {
      const listener = createPollingNotifyListener({
        logger,
        pollInterval: 30,
      });

      let fireCount = 0;

      const unsubscribe = listener.subscribe("test-queue", () => {
        fireCount++;
      });

      // Wait for some fires
      await sleep(100);
      const countBeforeUnsubscribe = fireCount;
      expect(countBeforeUnsubscribe).toBeGreaterThan(0);

      // Unsubscribe
      unsubscribe();

      // Wait again
      await sleep(100);

      // Count should not have increased
      expect(fireCount).toBe(countBeforeUnsubscribe);

      await listener.close();
    });

    it("should stop firing after close() even if subscribed", async () => {
      const listener = createPollingNotifyListener({
        logger,
        pollInterval: 30,
      });

      let fireCount = 0;

      listener.subscribe("test-queue", () => {
        fireCount++;
      });

      // Wait for some fires
      await sleep(100);
      const countBeforeClose = fireCount;
      expect(countBeforeClose).toBeGreaterThan(0);

      // Close without explicit unsubscribe
      await listener.close();

      // Wait again
      await sleep(100);

      // Count should not have increased
      expect(fireCount).toBe(countBeforeClose);
    });

    it("should unsubscribe only one callback when multiple subscribed", async () => {
      const listener = createPollingNotifyListener({
        logger,
        pollInterval: 30,
      });

      let callback1Count = 0;
      let callback2Count = 0;

      const unsubscribe1 = listener.subscribe("test-queue", () => {
        callback1Count++;
      });

      listener.subscribe("test-queue", () => {
        callback2Count++;
      });

      // Wait for some fires
      await sleep(80);
      expect(callback1Count).toBeGreaterThan(0);
      expect(callback2Count).toBeGreaterThan(0);

      const count1Before = callback1Count;
      const count2Before = callback2Count;

      // Unsubscribe callback1
      unsubscribe1();

      // Wait for more fires
      await sleep(80);

      // callback1 should not have increased, callback2 should have
      expect(callback1Count).toBe(count1Before);
      expect(callback2Count).toBeGreaterThan(count2Before);

      await listener.close();
    });
  });

  describe("B7.3: PG notify listener - unsubscribe removes only one callback", () => {
    it("should only fire remaining callback after unsubscribe", async () => {
      // Create a fake PgClient
      const handlers: Array<(msg: PgNotification) => void> = [];
      const fakePgClient: PgClient = {
        query: async () => {},
        on: (event: string, handler: any) => {
          if (event === "notification") {
            handlers.push(handler);
          }
        },
        removeListener: () => {},
      };

      // 1. Create PG notify listener
      const listener = createPgNotifyListener(fakePgClient, {
        logger,
        channel: "queue_jobs",
      });

      const callback1Fired: string[] = [];
      const callback2Fired: string[] = [];

      // 2. Subscribe two callbacks to same queue
      const unsubscribe1 = listener.subscribe("test-queue", () => {
        callback1Fired.push("fired");
      });

      listener.subscribe("test-queue", () => {
        callback2Fired.push("fired");
      });

      // 3. Unsubscribe one
      unsubscribe1();

      // 4. Manually invoke notification handler
      // The handler is registered when first subscribe is called
      for (const handler of handlers) {
        handler({ channel: "queue_jobs", payload: "test-queue" });
      }

      // 5. Assert only remaining callback fired
      expect(callback1Fired.length).toBe(0);
      expect(callback2Fired.length).toBe(1);

      await listener.close();
    });

    it("should fire both callbacks when none unsubscribed", async () => {
      const handlers: Array<(msg: PgNotification) => void> = [];
      const fakePgClient: PgClient = {
        query: async () => {},
        on: (event: string, handler: any) => {
          if (event === "notification") {
            handlers.push(handler);
          }
        },
        removeListener: () => {},
      };

      const listener = createPgNotifyListener(fakePgClient, {
        logger,
        channel: "queue_jobs",
      });

      let callback1Count = 0;
      let callback2Count = 0;

      listener.subscribe("test-queue", () => {
        callback1Count++;
      });

      listener.subscribe("test-queue", () => {
        callback2Count++;
      });

      // Fire notification
      for (const handler of handlers) {
        handler({ channel: "queue_jobs", payload: "test-queue" });
      }

      expect(callback1Count).toBe(1);
      expect(callback2Count).toBe(1);

      await listener.close();
    });

    it("should only notify callbacks for matching queue name", async () => {
      const handlers: Array<(msg: PgNotification) => void> = [];
      const fakePgClient: PgClient = {
        query: async () => {},
        on: (event: string, handler: any) => {
          if (event === "notification") {
            handlers.push(handler);
          }
        },
        removeListener: () => {},
      };

      const listener = createPgNotifyListener(fakePgClient, {
        logger,
        channel: "queue_jobs",
      });

      let queueACount = 0;
      let queueBCount = 0;

      listener.subscribe("queue-a", () => {
        queueACount++;
      });

      listener.subscribe("queue-b", () => {
        queueBCount++;
      });

      // Fire notification for queue-a only
      for (const handler of handlers) {
        handler({ channel: "queue_jobs", payload: "queue-a" });
      }

      expect(queueACount).toBe(1);
      expect(queueBCount).toBe(0);

      await listener.close();
    });

    it("should notify all subscribers when payload is empty", async () => {
      const handlers: Array<(msg: PgNotification) => void> = [];
      const fakePgClient: PgClient = {
        query: async () => {},
        on: (event: string, handler: any) => {
          if (event === "notification") {
            handlers.push(handler);
          }
        },
        removeListener: () => {},
      };

      const listener = createPgNotifyListener(fakePgClient, {
        logger,
        channel: "queue_jobs",
      });

      let queueACount = 0;
      let queueBCount = 0;

      listener.subscribe("queue-a", () => {
        queueACount++;
      });

      listener.subscribe("queue-b", () => {
        queueBCount++;
      });

      // Fire notification without payload (broadcast)
      for (const handler of handlers) {
        handler({ channel: "queue_jobs" });
      }

      expect(queueACount).toBe(1);
      expect(queueBCount).toBe(1);

      await listener.close();
    });
  });
});
