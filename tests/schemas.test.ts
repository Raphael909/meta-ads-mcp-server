import { describe, it, expect } from "vitest";
import {
  PaginationSchema,
  TimeRangeSchema,
  EffectiveStatusSchema,
} from "../src/schemas/common.js";

describe("common schemas", () => {
  describe("PaginationSchema", () => {
    it("validates valid pagination options", () => {
      const valid = { limit: 50, after: "cursor123" };
      const parsed = PaginationSchema.parse(valid);
      expect(parsed.limit).toBe(50);
      expect(parsed.after).toBe("cursor123");
    });

    it("rejects limits outside range 1-100", () => {
      expect(() => PaginationSchema.parse({ limit: 0 })).toThrow();
      expect(() => PaginationSchema.parse({ limit: 150 })).toThrow();
    });
  });

  describe("TimeRangeSchema", () => {
    it("accepts valid since and until dates", () => {
      const parsed = TimeRangeSchema.parse({ since: "2026-01-01", until: "2026-01-31" });
      expect(parsed.since).toBe("2026-01-01");
      expect(parsed.until).toBe("2026-01-31");
    });

    it("requires both since and until", () => {
      expect(() => TimeRangeSchema.parse({ since: "2026-01-01" })).toThrow();
    });
  });

  describe("EffectiveStatusSchema", () => {
    it("accepts valid Meta statuses", () => {
      const parsed = EffectiveStatusSchema.parse(["ACTIVE", "PAUSED"]);
      expect(parsed).toEqual(["ACTIVE", "PAUSED"]);
    });

    it("rejects invalid status", () => {
      expect(() => EffectiveStatusSchema.parse(["INVALID_STATUS"])).toThrow();
    });
  });
});
