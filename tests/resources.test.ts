import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerResources } from "../src/resources.js";
import * as graphApi from "../src/services/graph-api.js";

describe("MCP Resources", () => {
  it("registers static and template resources on McpServer", () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    const registerResourceSpy = vi.spyOn(server, "registerResource");

    registerResources(server);

    expect(registerResourceSpy).toHaveBeenCalledTimes(4);

    const registeredNames = registerResourceSpy.mock.calls.map((call) => call[0]);
    expect(registeredNames).toContain("ad_accounts");
    expect(registeredNames).toContain("account_overview");
    expect(registeredNames).toContain("active_campaigns");
    expect(registeredNames).toContain("account_issues");
  });

  it("reads static ad_accounts resource (meta-ads://accounts)", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    let accountsHandler: any;

    vi.spyOn(server, "registerResource").mockImplementation(
      (name, _uriOrTemplate, _config, handler) => {
        if (name === "ad_accounts") {
          accountsHandler = handler;
        }
        return {} as any;
      }
    );

    registerResources(server);
    expect(accountsHandler).toBeDefined();

    vi.spyOn(graphApi, "getAccessToken").mockReturnValue("mock_token");
    const mockAccountsData = {
      adaccounts: {
        data: [{ id: "act_123", name: "Main Account", currency: "USD" }],
      },
    };
    vi.spyOn(graphApi, "makeGraphApiCall").mockResolvedValue(mockAccountsData);

    const uri = new URL("meta-ads://accounts");
    const result = await accountsHandler(uri);

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe("meta-ads://accounts");
    expect(result.contents[0].mimeType).toBe("application/json");
    expect(JSON.parse(result.contents[0].text)).toEqual(mockAccountsData);
  });

  it("reads account_overview resource template", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    let overviewHandler: any;

    vi.spyOn(server, "registerResource").mockImplementation(
      (name, _uriOrTemplate, _config, handler) => {
        if (name === "account_overview") {
          overviewHandler = handler;
        }
        return {} as any;
      }
    );

    registerResources(server);
    expect(overviewHandler).toBeDefined();

    const mockAccountDetails = { id: "act_123", name: "Test Ad Account", amount_spent: "50000" };
    const fetchNodeSpy = vi.spyOn(graphApi, "fetchNode").mockResolvedValue(mockAccountDetails);

    const uri = new URL("meta-ads://account/act_123/overview");
    const result = await overviewHandler(uri, { act_id: "act_123" });

    expect(fetchNodeSpy).toHaveBeenCalledWith("act_123", expect.any(Object));
    expect(result.contents[0].mimeType).toBe("application/json");
    expect(JSON.parse(result.contents[0].text)).toEqual(mockAccountDetails);
  });

  it("reads active_campaigns resource template", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    let activeCampaignsHandler: any;

    vi.spyOn(server, "registerResource").mockImplementation(
      (name, _uriOrTemplate, _config, handler) => {
        if (name === "active_campaigns") {
          activeCampaignsHandler = handler;
        }
        return {} as any;
      }
    );

    registerResources(server);
    expect(activeCampaignsHandler).toBeDefined();

    const mockCampaigns = {
      data: [{ id: "camp_1", name: "Spring Sale", effective_status: "ACTIVE" }],
    };
    const fetchEdgeSpy = vi.spyOn(graphApi, "fetchEdge").mockResolvedValue(mockCampaigns);

    const uri = new URL("meta-ads://account/act_123/active-campaigns");
    const result = await activeCampaignsHandler(uri, { act_id: "act_123" });

    expect(fetchEdgeSpy).toHaveBeenCalledWith(
      "act_123",
      "campaigns",
      expect.objectContaining({ effective_status: ["ACTIVE"] })
    );
    expect(JSON.parse(result.contents[0].text)).toEqual(mockCampaigns);
  });

  it("reads account_issues resource template", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    let issuesHandler: any;

    vi.spyOn(server, "registerResource").mockImplementation(
      (name, _uriOrTemplate, _config, handler) => {
        if (name === "account_issues") {
          issuesHandler = handler;
        }
        return {} as any;
      }
    );

    registerResources(server);
    expect(issuesHandler).toBeDefined();

    const mockCampaigns = {
      data: [{ id: "camp_1", name: "Budget Issue Campaign", effective_status: "WITH_ISSUES" }],
    };
    const mockAdsets = {
      data: [{ id: "adset_1", name: "Learning Limited Ad Set", effective_status: "WITH_ISSUES" }],
    };
    const mockAds = {
      data: [{ id: "ad_1", name: "Rejected Ad", effective_status: "DISAPPROVED" }],
    };

    const fetchEdgeSpy = vi.spyOn(graphApi, "fetchEdge").mockImplementation((_id, edge) => {
      if (edge === "campaigns") return Promise.resolve(mockCampaigns);
      if (edge === "adsets") return Promise.resolve(mockAdsets);
      if (edge === "ads") return Promise.resolve(mockAds);
      return Promise.resolve({ data: [] });
    });

    const uri = new URL("meta-ads://account/act_123/issues");
    const result = await issuesHandler(uri, { act_id: "act_123" });

    expect(fetchEdgeSpy).toHaveBeenCalledWith(
      "act_123",
      "campaigns",
      expect.objectContaining({ effective_status: ["WITH_ISSUES"] })
    );
    expect(fetchEdgeSpy).toHaveBeenCalledWith(
      "act_123",
      "adsets",
      expect.objectContaining({ effective_status: ["WITH_ISSUES", "PENDING_REVIEW"] })
    );
    expect(fetchEdgeSpy).toHaveBeenCalledWith(
      "act_123",
      "ads",
      expect.objectContaining({
        effective_status: ["DISAPPROVED", "WITH_ISSUES", "PENDING_REVIEW"],
      })
    );
    expect(JSON.parse(result.contents[0].text)).toEqual({
      campaigns: mockCampaigns.data,
      adsets: mockAdsets.data,
      ads: mockAds.data,
    });
  });

  it.each(["me", "123", "act_12/adaccounts", "act_1?x=y", ["act_1", "act_2"]])(
    "rejects invalid act_id %j without calling the Graph API",
    async (badId) => {
      const server = new McpServer({ name: "test-server", version: "1.0.0" });
      const handlers: Record<string, any> = {};

      vi.spyOn(server, "registerResource").mockImplementation(
        (name, _uriOrTemplate, _config, handler) => {
          handlers[name] = handler;
          return {} as any;
        }
      );

      registerResources(server);
      const fetchNodeSpy = vi.spyOn(graphApi, "fetchNode").mockClear();
      const fetchEdgeSpy = vi.spyOn(graphApi, "fetchEdge").mockClear();

      for (const name of ["account_overview", "active_campaigns", "account_issues"]) {
        await expect(
          handlers[name](new URL("meta-ads://account/x/overview"), { act_id: badId })
        ).rejects.toThrow("Invalid ad account ID");
      }

      expect(fetchNodeSpy).not.toHaveBeenCalled();
      expect(fetchEdgeSpy).not.toHaveBeenCalled();
    }
  );

  it("throws API errors so the SDK returns a protocol error", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    let overviewHandler: any;

    vi.spyOn(server, "registerResource").mockImplementation(
      (name, _uriOrTemplate, _config, handler) => {
        if (name === "account_overview") {
          overviewHandler = handler;
        }
        return {} as any;
      }
    );

    registerResources(server);
    vi.spyOn(graphApi, "fetchNode").mockRejectedValue(new Error("Network failure"));

    const uri = new URL("meta-ads://account/act_999/overview");

    await expect(overviewHandler(uri, { act_id: "act_999" })).rejects.toThrow("Network failure");
  });
});
