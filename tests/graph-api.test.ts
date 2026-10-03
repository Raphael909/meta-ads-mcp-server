import { describe, it, expect } from "vitest";
import axios, { AxiosError, AxiosHeaders } from "axios";
import {
  prepareParams,
  buildInsightsParams,
  handleApiError,
} from "../src/services/graph-api.js";

describe("graph-api service", () => {
  describe("prepareParams", () => {
    it("stringifies keys configured in JSON_ENCODED_KEYS", () => {
      const base = { access_token: "test_token" };
      const options = {
        filtering: [{ field: "spend", operator: "GREATER_THAN", value: 100 }],
        time_range: { since: "2026-01-01", until: "2026-01-31" },
        targeting: { age_min: 18, age_max: 65 },
      };

      const result = prepareParams(base, options);

      expect(result.access_token).toBe("test_token");
      expect(result.filtering).toBe(
        JSON.stringify([{ field: "spend", operator: "GREATER_THAN", value: 100 }])
      );
      expect(result.time_range).toBe(
        JSON.stringify({ since: "2026-01-01", until: "2026-01-31" })
      );
      expect(result.targeting).toBe(
        JSON.stringify({ age_min: 18, age_max: 65 })
      );
    });

    it("comma-separates keys configured in CSV_KEYS", () => {
      const base = { access_token: "test_token" };
      const options = {
        fields: ["id", "name", "status"],
        breakdowns: ["age", "gender"],
      };

      const result = prepareParams(base, options);

      expect(result.fields).toBe("id,name,status");
      expect(result.breakdowns).toBe("age,gender");
    });

    it("omits null and undefined values", () => {
      const base = { access_token: "test_token" };
      const options = {
        limit: 50,
        after: undefined,
        before: null as unknown as undefined,
      };

      const result = prepareParams(base, options);

      expect(result.limit).toBe(50);
      expect("after" in result).toBe(false);
      expect("before" in result).toBe(false);
    });
  });

  describe("buildInsightsParams", () => {
    it("uses date_preset when no explicit time range is provided", () => {
      const base = { access_token: "test_token" };
      const result = buildInsightsParams(base, { date_preset: "last_7d" });

      expect(result.date_preset).toBe("last_7d");
    });

    it("prioritizes time_range over date_preset", () => {
      const base = { access_token: "test_token" };
      const result = buildInsightsParams(base, {
        date_preset: "last_7d",
        time_range: { since: "2026-01-01", until: "2026-01-10" },
      });

      expect(result.time_range).toBe(
        JSON.stringify({ since: "2026-01-01", until: "2026-01-10" })
      );
      expect(result.date_preset).toBeUndefined();
    });

    it("sets default_summary string flag when requested", () => {
      const base = { access_token: "test_token" };
      const result = buildInsightsParams(base, { default_summary: true });

      expect(result.default_summary).toBe("true");
    });
  });

  describe("handleApiError", () => {
    function createAxiosError(status: number, message?: string, code?: string): AxiosError {
      const headers = new AxiosHeaders();
      const response = {
        data: message ? { error: { message } } : {},
        status,
        statusText: "Error",
        headers: {},
        config: { headers },
      };
      const error = new AxiosError("Request failed", code, { headers }, null, response);
      return error;
    }

    it("handles 400 Bad Request with Meta error message", () => {
      const err = createAxiosError(400, "Invalid targeting spec");
      const msg = handleApiError(err);
      expect(msg).toContain("Bad request");
      expect(msg).toContain("Invalid targeting spec");
    });

    it("handles 401 Authentication failure", () => {
      const err = createAxiosError(401, "Session has expired");
      const msg = handleApiError(err);
      expect(msg).toContain("Authentication failed");
      expect(msg).toContain("Session has expired");
    });

    it("handles 403 Permission denied", () => {
      const err = createAxiosError(403, "User does not have ads_read permission");
      const msg = handleApiError(err);
      expect(msg).toContain("Permission denied");
      expect(msg).toContain("ads_read");
    });

    it("handles 404 Not Found", () => {
      const err = createAxiosError(404, "Node does not exist");
      const msg = handleApiError(err);
      expect(msg).toContain("Resource not found");
    });

    it("handles 429 Rate limit exceeded", () => {
      const err = createAxiosError(429, "Too many calls");
      const msg = handleApiError(err);
      expect(msg).toContain("Rate limit exceeded");
    });

    it("handles timeout errors", () => {
      const headers = new AxiosHeaders();
      const err = new AxiosError("Timeout", "ECONNABORTED", { headers });
      const msg = handleApiError(err);
      expect(msg).toContain("timed out");
    });

    it("handles generic Error instances", () => {
      const err = new Error("Something broke");
      const msg = handleApiError(err);
      expect(msg).toBe("Error: Unexpected error — Something broke");
    });
  });
});
