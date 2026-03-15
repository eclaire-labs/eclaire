import { describe, expect, it } from "vitest";
import {
  getBlockedUpgradePath,
  getUpgradeSteps,
  hasManualUpgradeRequired,
} from "../../scripts/upgrades/index.js";

describe("getUpgradeSteps", () => {
  it("returns both 0.6.0 and 0.7.0 steps for 0.5.0 -> 0.7.0", () => {
    const steps = getUpgradeSteps("0.5.0", "0.7.0");
    expect(steps.map((s) => s.version)).toEqual(["0.6.0", "0.7.0"]);
  });

  it("returns only 0.7.0 step for 0.6.0 -> 0.7.0", () => {
    const steps = getUpgradeSteps("0.6.0", "0.7.0");
    expect(steps.map((s) => s.version)).toEqual(["0.7.0"]);
  });

  it("returns empty for 0.7.0 -> 0.8.0 (no steps defined)", () => {
    const steps = getUpgradeSteps("0.7.0", "0.8.0");
    expect(steps).toEqual([]);
  });

  it("returns empty for same version", () => {
    const steps = getUpgradeSteps("0.7.0", "0.7.0");
    expect(steps).toEqual([]);
  });

  it("returns empty for versions before any steps", () => {
    const steps = getUpgradeSteps("0.1.0", "0.5.0");
    expect(steps).toEqual([]);
  });

  it("returns steps sorted by version", () => {
    const steps = getUpgradeSteps("0.0.0", "0.7.0");
    const versions = steps.map((s) => s.version);
    expect(versions).toEqual(["0.6.0", "0.7.0"]);
  });
});

describe("getBlockedUpgradePath", () => {
  it("blocks upgrade from 0.5.0 -> 0.7.0 (hits 0.6.0 block first)", () => {
    const result = getBlockedUpgradePath("0.5.0", "0.7.0");
    expect(result.blocked).toBe(true);
    expect(result.message).toContain("0.6.0");
  });

  it("blocks upgrade from 0.6.1 -> 0.7.0 (hits 0.7.0 block)", () => {
    const result = getBlockedUpgradePath("0.6.1", "0.7.0");
    expect(result.blocked).toBe(true);
    expect(result.message).toContain("0.7.0");
  });

  it("does NOT block fresh installs (null -> 0.7.0)", () => {
    const result = getBlockedUpgradePath(null, "0.7.0");
    expect(result.blocked).toBe(false);
  });

  it("does NOT block upgrade within post-block versions (0.7.0 -> 0.7.1)", () => {
    const result = getBlockedUpgradePath("0.7.0", "0.7.1");
    expect(result.blocked).toBe(false);
  });

  it("does NOT block upgrade within post-block versions (0.7.0 -> 0.8.0)", () => {
    const result = getBlockedUpgradePath("0.7.0", "0.8.0");
    expect(result.blocked).toBe(false);
  });

  it("blocks upgrade from 0.4.0 -> 0.6.2 (hits 0.6.0 block)", () => {
    const result = getBlockedUpgradePath("0.4.0", "0.6.2");
    expect(result.blocked).toBe(true);
    expect(result.message).toContain("0.6.0");
  });
});

describe("hasManualUpgradeRequired", () => {
  it("returns false for 0.6.0 -> 0.7.0 (blocking steps have no requiresManualUpgrade)", () => {
    expect(hasManualUpgradeRequired("0.6.0", "0.7.0")).toBe(false);
  });

  it("returns false for null -> 0.7.0", () => {
    expect(hasManualUpgradeRequired(null, "0.7.0")).toBe(false);
  });

  it("returns false for 0.7.0 -> 0.8.0 (no steps)", () => {
    expect(hasManualUpgradeRequired("0.7.0", "0.8.0")).toBe(false);
  });
});
