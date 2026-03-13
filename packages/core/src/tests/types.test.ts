import { describe, expect, it } from "vitest";
import {
  ASSET_TYPES,
  CHANNEL_CAPABILITIES,
  CHANNEL_PLATFORMS,
  FEEDBACK_SENTIMENTS,
  FLAG_COLORS,
  HISTORY_ACTIONS,
  HISTORY_ACTORS,
  HISTORY_ITEM_TYPES,
  JOB_STATUSES,
  MESSAGE_ROLES,
  REVIEW_STATUSES,
  TASK_STATUSES,
  USER_TYPES,
} from "../types.js";

const constArrays = [
  {
    name: "USER_TYPES",
    arr: USER_TYPES,
    expected: ["user", "assistant", "worker"],
  },
  {
    name: "REVIEW_STATUSES",
    arr: REVIEW_STATUSES,
    expected: ["pending", "accepted", "rejected"],
  },
  {
    name: "FLAG_COLORS",
    arr: FLAG_COLORS,
    expected: ["red", "yellow", "orange", "green", "blue"],
  },
  {
    name: "ASSET_TYPES",
    arr: ASSET_TYPES,
    expected: ["photos", "documents", "bookmarks", "notes", "tasks"],
  },
  {
    name: "JOB_STATUSES",
    arr: JOB_STATUSES,
    expected: ["pending", "processing", "completed", "failed", "retry_pending"],
  },
  {
    name: "TASK_STATUSES",
    arr: TASK_STATUSES,
    expected: [
      "backlog",
      "not-started",
      "in-progress",
      "completed",
      "cancelled",
    ],
  },
  {
    name: "MESSAGE_ROLES",
    arr: MESSAGE_ROLES,
    expected: ["user", "assistant"],
  },
  {
    name: "CHANNEL_PLATFORMS",
    arr: CHANNEL_PLATFORMS,
    expected: ["telegram", "slack", "whatsapp", "email", "discord"],
  },
  {
    name: "CHANNEL_CAPABILITIES",
    arr: CHANNEL_CAPABILITIES,
    expected: ["notification", "chat", "bidirectional"],
  },
  {
    name: "FEEDBACK_SENTIMENTS",
    arr: FEEDBACK_SENTIMENTS,
    expected: ["positive", "negative"],
  },
  {
    name: "HISTORY_ACTORS",
    arr: HISTORY_ACTORS,
    expected: ["human", "agent", "system", "service"],
  },
] as const;

describe.each(constArrays)("$name", ({ arr, expected }) => {
  it("contains expected values", () => {
    expect(Array.from(arr)).toEqual(expected);
  });
});

describe("HISTORY_ACTIONS", () => {
  it("has 23 entries", () => {
    expect(HISTORY_ACTIONS.length).toBe(23);
  });
});

describe("HISTORY_ITEM_TYPES", () => {
  it("has 19 entries", () => {
    expect(HISTORY_ITEM_TYPES.length).toBe(19);
  });
});
