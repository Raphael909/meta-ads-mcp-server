import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSavedAudienceTools } from "../src/tools/saved-audiences.js";
import * as graphApi from "../src/services/graph-api.js";

describe("saved-audiences tools", () => {
  it("registers both read tools on McpServer", () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    const registerToolSpy = vi.spyOn(server, "registerTool");

    registerSavedAudienceTools(server);

    expect(registerToolSpy).toHaveBeenCalledTimes(2);

    const registeredNames = registerToolSpy.mock.calls.map((call) => call[0]);
    expect(registeredNames).toContain("meta_ads_get_saved_audiences_by_adaccount");
    expect(registeredNames).toContain("meta_ads_get_saved_audience_by_id");
  });

  it("calls fetchEdge for meta_ads_get_saved_audiences_by_adaccount", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    let listHandler: any;

    vi.spyOn(server, "registerTool").mockImplementation((name, _config, handler) => {
      if (name === "meta_ads_get_saved_audiences_by_adaccount") {
        listHandler = handler;
      }
      return {} as any;
    });

    registerSavedAudienceTools(server);
    expect(listHandler).toBeDefined();

    const mockData = { data: [{ id: "12345", name: "Target Audience" }] };
    const fetchEdgeSpy = vi.spyOn(graphApi, "fetchEdge").mockResolvedValue(mockData);

    const result = await listHandler({ act_id: "act_123456789", limit: 10 });

    expect(fetchEdgeSpy).toHaveBeenCalledWith(
      "act_123456789",
      "saved_audiences",
      expect.objectContaining({ limit: 10 })
    );
    expect(result.structuredContent).toEqual(mockData);
  });

  it("calls fetchNode for meta_ads_get_saved_audience_by_id", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    let getHandler: any;

    vi.spyOn(server, "registerTool").mockImplementation((name, _config, handler) => {
      if (name === "meta_ads_get_saved_audience_by_id") {
        getHandler = handler;
      }
      return {} as any;
    });

    registerSavedAudienceTools(server);
    expect(getHandler).toBeDefined();

    const mockData = { id: "12345", name: "Target Audience", targeting: { age_min: 25 } };
    const fetchNodeSpy = vi.spyOn(graphApi, "fetchNode").mockResolvedValue(mockData);

    const result = await getHandler({ saved_audience_id: "12345" });

    expect(fetchNodeSpy).toHaveBeenCalledWith(
      "12345",
      expect.objectContaining({
        fields: expect.arrayContaining(["id", "name", "targeting"]),
      })
    );
    expect(result.structuredContent).toEqual(mockData);
  });
});
