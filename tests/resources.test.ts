import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerResources,
  fetchAccessibleAccounts,
  resetAccountsCache,
  formatResourceJson,
} from "../src/resources.js";
import { CHARACTER_LIMIT } from "../src/constants.js";
import * as graphApi from "../src/services/graph-api.js";

describe("MCP Resources", () => {
  beforeEach(() => {
    resetAccountsCache();
    vi.restoreAllMocks();
  });

  it("registers static and template resources on McpServer with titles", () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    const registerResourceSpy = vi.spyOn(server, "registerResource");

    registerResources(server);

    expect(registerResourceSpy).toHaveBeenCalledTimes(4);

    const registeredNames = registerResourceSpy.mock.calls.map((call) => call[0]);
    expect(registeredNames).toContain("ad_accounts");
    expect(registeredNames).toContain("account_overview");
    expect(registeredNames).toContain("active_campaigns");
    expect(registeredNames).toContain("account_issues");

    const configsByName = new Map(
      registerResourceSpy.mock.calls.map((call) => [call[0], call[2] as any])
    );
    expect(configsByName.get("ad_accounts")?.title).toBe("Meta Ad Accounts");
    expect(configsByName.get("account_overview")?.title).toBe("Meta Ad Account Overview");
    expect(configsByName.get("active_campaigns")?.title).toBe("Meta Active Campaigns Snapshot");
    expect(configsByName.get("account_issues")?.title).toBe("Meta Ad Account Issues & Warnings");
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
      paging: {
        campaigns: undefined,
        adsets: undefined,
        ads: undefined,
      },
      has_more: false,
    });
  });

  it("signals has_more: true and includes paging URLs when pagination exists in account_issues", async () => {
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

    const mockCampaigns = { data: [] };
    const mockAdsets = { data: [] };
    const mockAds = {
      data: [{ id: "ad_1", name: "Disapproved Ad", effective_status: "DISAPPROVED" }],
      paging: {
        cursors: { before: "cur_1", after: "cur_2" },
        next: "https://graph.facebook.com/v22.0/act_123/ads?after=cur_2",
      },
    };

    vi.spyOn(graphApi, "fetchEdge").mockImplementation((_id, edge) => {
      if (edge === "campaigns") return Promise.resolve(mockCampaigns);
      if (edge === "adsets") return Promise.resolve(mockAdsets);
      if (edge === "ads") return Promise.resolve(mockAds);
      return Promise.resolve({ data: [] });
    });

    const uri = new URL("meta-ads://account/act_123/issues");
    const result = await issuesHandler(uri, { act_id: "act_123" });
    const parsed = JSON.parse(result.contents[0].text);

    expect(parsed.has_more).toBe(true);
    expect(parsed.paging.ads.next).toBe(
      "https://graph.facebook.com/v22.0/act_123/ads?after=cur_2"
    );
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

  describe("fetchAccessibleAccounts", () => {
    it("fetches ad accounts from /me", async () => {
      vi.spyOn(graphApi, "getAccessToken").mockReturnValue("mock_token");
      const mockAccounts = [
        { id: "act_101", name: "Client A" },
        { id: "act_102", name: "Client B" },
      ];
      const makeCallSpy = vi.spyOn(graphApi, "makeGraphApiCall").mockResolvedValue({
        adaccounts: { data: mockAccounts },
      });

      const accounts = await fetchAccessibleAccounts();

      expect(accounts).toEqual(mockAccounts);
      expect(makeCallSpy).toHaveBeenCalledTimes(1);
    });

    it("caches the result to avoid duplicate network calls within TTL", async () => {
      vi.spyOn(graphApi, "getAccessToken").mockReturnValue("mock_token");
      const mockAccounts = [{ id: "act_101", name: "Client A" }];
      const makeCallSpy = vi.spyOn(graphApi, "makeGraphApiCall").mockResolvedValue({
        adaccounts: { data: mockAccounts },
      });

      const firstCall = await fetchAccessibleAccounts();
      const secondCall = await fetchAccessibleAccounts();

      expect(firstCall).toEqual(mockAccounts);
      expect(secondCall).toEqual(mockAccounts);
      expect(makeCallSpy).toHaveBeenCalledTimes(1);
    });

    it("clears cache when resetAccountsCache is called", async () => {
      vi.spyOn(graphApi, "getAccessToken").mockReturnValue("mock_token");
      const mockAccounts = [{ id: "act_101", name: "Client A" }];
      const makeCallSpy = vi.spyOn(graphApi, "makeGraphApiCall").mockResolvedValue({
        adaccounts: { data: mockAccounts },
      });

      await fetchAccessibleAccounts();
      expect(makeCallSpy).toHaveBeenCalledTimes(1);

      resetAccountsCache();

      await fetchAccessibleAccounts();
      expect(makeCallSpy).toHaveBeenCalledTimes(2);
    });

    it("returns an empty array if the Graph API request fails", async () => {
      vi.spyOn(graphApi, "getAccessToken").mockReturnValue("mock_token");
      vi.spyOn(graphApi, "makeGraphApiCall").mockRejectedValue(new Error("Graph API error"));

      const accounts = await fetchAccessibleAccounts();
      expect(accounts).toEqual([]);
    });

    it("does not cache failures, so the next call retries", async () => {
      vi.spyOn(graphApi, "getAccessToken").mockReturnValue("mock_token");
      vi.spyOn(console, "error").mockImplementation(() => {});
      const makeCallSpy = vi
        .spyOn(graphApi, "makeGraphApiCall")
        .mockRejectedValueOnce(new Error("token expired"))
        .mockResolvedValueOnce({ adaccounts: { data: [{ id: "act_1" }] } });

      expect(await fetchAccessibleAccounts()).toEqual([]);
      expect(await fetchAccessibleAccounts()).toEqual([{ id: "act_1" }]);
      expect(makeCallSpy).toHaveBeenCalledTimes(2);
    });

    it("requests up to 100 accounts instead of Graph's default page of 25", async () => {
      vi.spyOn(graphApi, "getAccessToken").mockReturnValue("mock_token");
      const makeCallSpy = vi
        .spyOn(graphApi, "makeGraphApiCall")
        .mockResolvedValue({ adaccounts: { data: [] } });

      await fetchAccessibleAccounts();

      expect(makeCallSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ fields: "adaccounts.limit(100){id,name}" })
      );
    });
  });

  describe("formatResourceJson fallback", () => {
    it("always returns valid JSON within the limit when structural trimming is impossible", () => {
      const limit = 1000;
      const text = formatResourceJson({ blob: 'x"\n'.repeat(5000) }, limit);

      expect(text.length).toBeLessThanOrEqual(limit);
      expect(JSON.parse(text)._truncated).toBe(true);
    });
  });

  describe("template list callbacks", () => {
    it("enumerates concrete URIs for account_overview, active_campaigns, and account_issues", async () => {
      const server = new McpServer({ name: "test-server", version: "1.0.0" });
      const templatesByName = new Map<string, ResourceTemplate>();

      vi.spyOn(server, "registerResource").mockImplementation(
        (name, uriOrTemplate) => {
          if (uriOrTemplate instanceof ResourceTemplate) {
            templatesByName.set(name as string, uriOrTemplate);
          }
          return {} as any;
        }
      );

      registerResources(server);

      vi.spyOn(graphApi, "getAccessToken").mockReturnValue("mock_token");
      vi.spyOn(graphApi, "makeGraphApiCall").mockResolvedValue({
        adaccounts: {
          data: [
            { id: "act_123", name: "Alpha Brand" },
            { id: "act_456" },
          ],
        },
      });

      const overviewTemplate = templatesByName.get("account_overview")!;
      expect(overviewTemplate.listCallback).toBeDefined();
      const overviewList = await overviewTemplate.listCallback!({} as any);
      expect(overviewList.resources).toEqual([
        {
          uri: "meta-ads://account/act_123/overview",
          name: "account_overview_act_123",
          title: "Account Overview: Alpha Brand (act_123)",
          description: "Detailed profile and settings for ad account Alpha Brand (act_123).",
          mimeType: "application/json",
        },
        {
          uri: "meta-ads://account/act_456/overview",
          name: "account_overview_act_456",
          title: "Account Overview (act_456)",
          description: "Detailed profile and settings for ad account act_456.",
          mimeType: "application/json",
        },
      ]);

      const campaignsTemplate = templatesByName.get("active_campaigns")!;
      expect(campaignsTemplate.listCallback).toBeDefined();
      const campaignsList = await campaignsTemplate.listCallback!({} as any);
      expect(campaignsList.resources).toEqual([
        {
          uri: "meta-ads://account/act_123/active-campaigns",
          name: "active_campaigns_act_123",
          title: "Active Campaigns: Alpha Brand (act_123)",
          description:
            "Snapshot of up to 50 active campaigns in ad account Alpha Brand (act_123). If paging.next is present, use meta_ads_fetch_pagination_url to fetch additional pages.",
          mimeType: "application/json",
        },
        {
          uri: "meta-ads://account/act_456/active-campaigns",
          name: "active_campaigns_act_456",
          title: "Active Campaigns (act_456)",
          description:
            "Snapshot of up to 50 active campaigns in ad account act_456. If paging.next is present, use meta_ads_fetch_pagination_url to fetch additional pages.",
          mimeType: "application/json",
        },
      ]);

      const issuesTemplate = templatesByName.get("account_issues")!;
      expect(issuesTemplate.listCallback).toBeDefined();
      const issuesList = await issuesTemplate.listCallback!({} as any);
      expect(issuesList.resources).toEqual([
        {
          uri: "meta-ads://account/act_123/issues",
          name: "account_issues_act_123",
          title: "Issues & Warnings: Alpha Brand (act_123)",
          description:
            "Snapshot of up to 50 items each across campaigns, ad sets, and ads with delivery issues or policy disapprovals in ad account Alpha Brand (act_123). If has_more is true, use meta_ads_fetch_pagination_url or specific query tools to fetch additional pages.",
          mimeType: "application/json",
        },
        {
          uri: "meta-ads://account/act_456/issues",
          name: "account_issues_act_456",
          title: "Issues & Warnings (act_456)",
          description:
            "Snapshot of up to 50 items each across campaigns, ad sets, and ads with delivery issues or policy disapprovals in ad account act_456. If has_more is true, use meta_ads_fetch_pagination_url or specific query tools to fetch additional pages.",
          mimeType: "application/json",
        },
      ]);
    });
  });

  describe("formatResourceJson", () => {
    it("returns unmodified JSON when string length is within limit", () => {
      const data = { id: "act_1", name: "Test Account" };
      const output = formatResourceJson(data, 1000);
      expect(output).toBe(JSON.stringify(data, null, 2));
      expect(JSON.parse(output)).toEqual(data);
    });

    it("performs structured array truncation and marks _truncated: true when exceeding limit", () => {
      const items = Array.from({ length: 50 }, (_, i) => ({
        id: `item_${i}`,
        description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
      }));
      const data = { data: items };

      // Set a low limit to trigger truncation
      const limit = 500;
      const output = formatResourceJson(data, limit);

      expect(output.length).toBeLessThanOrEqual(limit);
      const parsed = JSON.parse(output);
      expect(parsed._truncated).toBe(true);
      expect(parsed._character_limit).toBe(limit);
      expect(parsed._warning).toBeDefined();
      expect(parsed.data.length).toBeLessThan(items.length);
    });

    it("uses CHARACTER_LIMIT from constants by default", () => {
      const data = { id: "act_1" };
      const output = formatResourceJson(data);
      expect(output.length).toBeLessThan(CHARACTER_LIMIT);
      expect(JSON.parse(output)).toEqual(data);
    });
  });
});
