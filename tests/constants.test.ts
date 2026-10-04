import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isWriteToolsEnabled, CHARACTER_LIMIT } from "../src/constants.js";

describe("constants", () => {
  it("defines CHARACTER_LIMIT as 25000", () => {
    expect(CHARACTER_LIMIT).toBe(25000);
  });
  const originalEnv = process.env.META_ADS_ENABLE_WRITE_TOOLS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.META_ADS_ENABLE_WRITE_TOOLS;
    } else {
      process.env.META_ADS_ENABLE_WRITE_TOOLS = originalEnv;
    }
  });

  describe("isWriteToolsEnabled", () => {
    it("returns false when env var is not set", () => {
      delete process.env.META_ADS_ENABLE_WRITE_TOOLS;
      expect(isWriteToolsEnabled()).toBe(false);
    });

    it("returns true for truthy values regardless of casing", () => {
      const truthy = ["true", "TRUE", "1", "yes", "YES", "on", "On"];
      for (const val of truthy) {
        process.env.META_ADS_ENABLE_WRITE_TOOLS = val;
        expect(isWriteToolsEnabled()).toBe(true);
      }
    });

    it("returns false for non-truthy values", () => {
      const falsy = ["false", "0", "no", "off", "random"];
      for (const val of falsy) {
        process.env.META_ADS_ENABLE_WRITE_TOOLS = val;
        expect(isWriteToolsEnabled()).toBe(false);
      }
    });
  });
});
