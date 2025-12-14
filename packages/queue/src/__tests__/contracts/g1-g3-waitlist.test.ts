/**
 * G1-G3: Waitlist Tests
 *
 * Tests for the job waitlist functionality that provides push-based
 * notifications to waiting workers.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestLogger, sleep } from "../testkit/index.js";
import { createJobWaitlist } from "../../database/waitlist.js";
import type { JobWaitlistInterface } from "../../types.js";

describe("G1-G3: Waitlist", () => {
  const logger = createTestLogger();
  let waitlist: JobWaitlistInterface;

  beforeEach(() => {
    waitlist = createJobWaitlist({ logger });
  });

  describe("G1: Single waiter is notified", () => {
    it("should resolve waiter promise when notified", async () => {
      // 1. Add a waiter
      const waiterPromise = waitlist.addWaiter("bookmarks", "worker-1", 5000);

      // Give the waiter time to be registered
      await sleep(10);

      // 2. Verify waiter is registered
      expect(waitlist.getWaiterCount("bookmarks")).toBe(1);

      // 3. Notify waiters
      const notified = waitlist.notifyWaiters("bookmarks", 1);
      expect(notified).toBe(1);

      // 4. Waiter promise should resolve
      const result = await waiterPromise;
      // The waitlist resolves with undefined when notified (worker should then claim)
      expect(result).toBeUndefined();

      // 5. Waiter should be removed
      expect(waitlist.getWaiterCount("bookmarks")).toBe(0);
    });

    it("should notify correct asset type", async () => {
      const bookmarkWaiterPromise = waitlist.addWaiter("bookmarks", "worker-1", 5000);
      const photosWaiterPromise = waitlist.addWaiter("photos", "worker-2", 5000);

      await sleep(10);

      expect(waitlist.getWaiterCount("bookmarks")).toBe(1);
      expect(waitlist.getWaiterCount("photos")).toBe(1);

      // Notify only bookmarks
      waitlist.notifyWaiters("bookmarks", 1);

      const bookmarkResult = await bookmarkWaiterPromise;
      expect(bookmarkResult).toBeUndefined();

      // Photos waiter should still be waiting
      expect(waitlist.getWaiterCount("photos")).toBe(1);

      // Clean up photos waiter
      waitlist.notifyWaiters("photos", 1);
      await photosWaiterPromise;
    });
  });

  describe("G2: Multiple waiters with limited notifications", () => {
    it("should notify exactly N waiters when count is specified", async () => {
      // 1. Add 3 waiters
      const waiter1 = waitlist.addWaiter("bookmarks", "worker-1", 5000);
      const waiter2 = waitlist.addWaiter("bookmarks", "worker-2", 5000);
      const waiter3 = waitlist.addWaiter("bookmarks", "worker-3", 5000);

      await sleep(10);
      expect(waitlist.getWaiterCount("bookmarks")).toBe(3);

      // 2. Notify only 2 waiters
      const notified = waitlist.notifyWaiters("bookmarks", 2);
      expect(notified).toBe(2);

      // 3. First 2 waiters should resolve (FIFO order)
      const result1 = await waiter1;
      const result2 = await waiter2;
      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();

      // 4. Third waiter should still be waiting
      expect(waitlist.getWaiterCount("bookmarks")).toBe(1);

      // 5. Clean up remaining waiter
      waitlist.notifyWaiters("bookmarks", 1);
      await waiter3;
    });

    it("should notify all waiters when count exceeds available", async () => {
      const waiter1 = waitlist.addWaiter("bookmarks", "worker-1", 5000);
      const waiter2 = waitlist.addWaiter("bookmarks", "worker-2", 5000);

      await sleep(10);
      expect(waitlist.getWaiterCount("bookmarks")).toBe(2);

      // Request to notify 10, but only 2 available
      const notified = waitlist.notifyWaiters("bookmarks", 10);
      expect(notified).toBe(2);

      await waiter1;
      await waiter2;

      expect(waitlist.getWaiterCount("bookmarks")).toBe(0);
    });

    it("should notify in FIFO order", async () => {
      const order: number[] = [];

      const waiter1 = waitlist.addWaiter("bookmarks", "worker-1", 5000).then(() => {
        order.push(1);
      });
      await sleep(5);

      const waiter2 = waitlist.addWaiter("bookmarks", "worker-2", 5000).then(() => {
        order.push(2);
      });
      await sleep(5);

      const waiter3 = waitlist.addWaiter("bookmarks", "worker-3", 5000).then(() => {
        order.push(3);
      });

      await sleep(10);

      // Notify all
      waitlist.notifyAllWaiters("bookmarks");

      await Promise.all([waiter1, waiter2, waiter3]);

      // Should be notified in FIFO order
      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe("G3: Timeout handling", () => {
    it("should resolve with null after timeout", async () => {
      // 1. Add waiter with short timeout
      const waiterPromise = waitlist.addWaiter("bookmarks", "worker-1", 100);

      // 2. Don't notify - wait for timeout
      const result = await waiterPromise;

      // 3. Should resolve with null (timeout)
      expect(result).toBeNull();

      // 4. Waiter should be cleaned up
      expect(waitlist.getWaiterCount("bookmarks")).toBe(0);
    });

    it("should not timeout if notified before deadline", async () => {
      const waiterPromise = waitlist.addWaiter("bookmarks", "worker-1", 1000);

      await sleep(10);

      // Notify before timeout
      waitlist.notifyWaiters("bookmarks", 1);

      const result = await waiterPromise;
      // Should resolve with undefined (notified), not null (timeout)
      expect(result).toBeUndefined();
    });

    it("should handle multiple timeouts independently", async () => {
      const waiter1 = waitlist.addWaiter("bookmarks", "worker-1", 50);
      const waiter2 = waitlist.addWaiter("bookmarks", "worker-2", 200);

      // Wait for first timeout
      const result1 = await waiter1;
      expect(result1).toBeNull();

      // Second waiter should still be active
      expect(waitlist.getWaiterCount("bookmarks")).toBe(1);

      // Notify second waiter before its timeout
      waitlist.notifyWaiters("bookmarks", 1);
      const result2 = await waiter2;
      expect(result2).toBeUndefined();
    });
  });

  describe("Additional waitlist tests", () => {
    it("should return 0 when notifying with no waiters", () => {
      const notified = waitlist.notifyWaiters("bookmarks", 5);
      expect(notified).toBe(0);
    });

    it("should track stats across asset types", async () => {
      waitlist.addWaiter("bookmarks", "w1", 5000);
      waitlist.addWaiter("bookmarks", "w2", 5000);
      waitlist.addWaiter("photos", "w3", 5000);

      await sleep(10);

      const stats = waitlist.getStats();
      expect(stats.bookmarks).toBe(2);
      expect(stats.photos).toBe(1);
      expect(stats.documents).toBe(0);
      expect(stats.notes).toBe(0);
      expect(stats.tasks).toBe(0);

      // Clean up
      waitlist.notifyAllWaiters("bookmarks");
      waitlist.notifyAllWaiters("photos");
    });

    it("should support scheduled wakeups", async () => {
      let wakeupCalled = false;

      const waitlistWithScheduler = createJobWaitlist({
        logger,
        findNextScheduledJob: async () => {
          // Return a time 50ms in the future
          return new Date(Date.now() + 50);
        },
      });

      // Add a waiter
      const waiterPromise = waitlistWithScheduler.addWaiter("bookmarks", "worker-1", 5000);
      await sleep(10);

      // Schedule wakeup
      await waitlistWithScheduler.scheduleNextWakeup("bookmarks");

      // Wait for scheduled wakeup
      const result = await waiterPromise;

      // Should have been woken up by the scheduled timer
      expect(result).toBeUndefined();
    });
  });
});
