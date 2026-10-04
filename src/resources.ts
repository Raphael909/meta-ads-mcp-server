import axios from "axios";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FB_GRAPH_URL, DEFAULT_AD_ACCOUNT_FIELDS } from "./constants.js";
import {
  getAccessToken,
  makeGraphApiCall,
  fetchNode,
  fetchEdge,
  handleApiError,
} from "./services/graph-api.js";

const AD_ACCOUNT_ID_PATTERN = /^act_\d+$/;

let cachedAccountsPromise: Promise<Array<{ id: string; name?: string }>> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10000;

/**
 * Fetch accessible ad accounts for template discovery.
 * Uses a short TTL cache to avoid duplicate network calls when multiple template
 * list callbacks are invoked together during `resources/list`.
 */
export async function fetchAccessibleAccounts(): Promise<Array<{ id: string; name?: string }>> {
  const now = Date.now();
  if (cachedAccountsPromise && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedAccountsPromise;
  }
  cacheTimestamp = now;
  cachedAccountsPromise = (async () => {
    try {
      const token = getAccessToken();
      const data = (await makeGraphApiCall(`${FB_GRAPH_URL}/me`, {
        access_token: token,
        fields: "adaccounts{id,name}",
      })) as { adaccounts?: { data?: Array<{ id: string; name?: string }> } };
      return data?.adaccounts?.data ?? [];
    } catch {
      return [];
    }
  })();
  return cachedAccountsPromise;
}

/**
 * Reset the accounts discovery cache (primarily used in tests).
 */
export function resetAccountsCache(): void {
  cachedAccountsPromise = null;
  cacheTimestamp = 0;
}

/**
 * Validate the `act_id` URI template variable before it is interpolated into a Graph API path.
 * Rejects arrays and anything that is not `act_<digits>` to prevent path/endpoint injection.
 */
function parseAccountId(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !AD_ACCOUNT_ID_PATTERN.test(value)) {
    throw new Error(
      "Invalid ad account ID — expected the form 'act_' followed by digits, e.g. 'act_1234567890'."
    );
  }
  return value;
}

/**
 * Run a resource loader and wrap its result in MCP resource contents.
 *
 * Unlike tools, resource reads have no in-band error channel: failures must be thrown so the
 * SDK returns a JSON-RPC error instead of error text masquerading as successful content.
 */
async function readJsonResource(uri: URL, load: () => Promise<unknown>) {
  let data: unknown;
  try {
    data = await load();
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(handleApiError(error));
    }
    throw error;
  }
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

const ACTIVE_CAMPAIGN_FIELDS = [
  "id",
  "name",
  "objective",
  "status",
  "effective_status",
  "daily_budget",
  "lifetime_budget",
  "budget_remaining",
  "bid_strategy",
  "start_time",
  "stop_time",
];

const ISSUE_CAMPAIGN_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "issues_info",
  "created_time",
  "updated_time",
];

const ISSUE_ADSET_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "issues_info",
  "campaign_id",
  "created_time",
  "updated_time",
];

const ISSUE_AD_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "issues_info",
  "adset_id",
  "campaign_id",
  "created_time",
  "updated_time",
];

/**
 * Register MCP Resources providing zero-shot context to AI models.
 *
 * Resources expose read-only state directly into the LLM context window without
 * requiring the model to trigger multiple discovery tool calls:
 * - meta-ads://accounts (list of accessible accounts with currency & spend)
 * - meta-ads://account/{act_id}/overview (account details and status)
 * - meta-ads://account/{act_id}/active-campaigns (currently running campaigns & budgets)
 * - meta-ads://account/{act_id}/issues (delivery warnings, rejected ads, pending reviews across campaigns, ad sets, and ads)
 */
export function registerResources(server: McpServer): void {
  // 1. Static resource: List all accessible ad accounts
  server.registerResource(
    "ad_accounts",
    "meta-ads://accounts",
    {
      title: "Meta Ad Accounts",
      mimeType: "application/json",
      description:
        "List of all Meta ad accounts accessible with the current access token, including account ID, name, status, currency, spend, and balance.",
    },
    (uri) =>
      readJsonResource(uri, () =>
        makeGraphApiCall(`${FB_GRAPH_URL}/me`, {
          access_token: getAccessToken(),
          fields: "adaccounts{id,name,account_id,account_status,currency,amount_spent,balance}",
        })
      )
  );

  // 2. Dynamic resource template: Specific ad account overview
  server.registerResource(
    "account_overview",
    new ResourceTemplate("meta-ads://account/{act_id}/overview", {
      list: async () => {
        const accounts = await fetchAccessibleAccounts();
        return {
          resources: accounts.map((acc) => ({
            uri: `meta-ads://account/${acc.id}/overview`,
            name: `account_overview_${acc.id}`,
            title: acc.name
              ? `Account Overview: ${acc.name} (${acc.id})`
              : `Account Overview (${acc.id})`,
            description: `Detailed profile and settings for ad account ${
              acc.name ? `${acc.name} (${acc.id})` : acc.id
            }.`,
            mimeType: "application/json",
          })),
        };
      },
    }),
    {
      title: "Meta Ad Account Overview",
      mimeType: "application/json",
      description:
        "Detailed profile and settings for a specific ad account (e.g. meta-ads://account/act_123456/overview).",
    },
    (uri, { act_id }) =>
      readJsonResource(uri, () =>
        fetchNode(parseAccountId(act_id), { fields: DEFAULT_AD_ACCOUNT_FIELDS })
      )
  );

  // 3. Dynamic resource template: Active campaigns in an ad account
  server.registerResource(
    "active_campaigns",
    new ResourceTemplate("meta-ads://account/{act_id}/active-campaigns", {
      list: async () => {
        const accounts = await fetchAccessibleAccounts();
        return {
          resources: accounts.map((acc) => ({
            uri: `meta-ads://account/${acc.id}/active-campaigns`,
            name: `active_campaigns_${acc.id}`,
            title: acc.name
              ? `Active Campaigns: ${acc.name} (${acc.id})`
              : `Active Campaigns (${acc.id})`,
            description: `Snapshot of active campaigns in ad account ${
              acc.name ? `${acc.name} (${acc.id})` : acc.id
            }.`,
            mimeType: "application/json",
          })),
        };
      },
    }),
    {
      title: "Meta Active Campaigns Snapshot",
      mimeType: "application/json",
      description:
        "Currently active campaigns in an ad account with objective, budgets, and bid strategy (e.g. meta-ads://account/act_123456/active-campaigns).",
    },
    (uri, { act_id }) =>
      readJsonResource(uri, () =>
        fetchEdge(parseAccountId(act_id), "campaigns", {
          effective_status: ["ACTIVE"],
          fields: ACTIVE_CAMPAIGN_FIELDS,
          limit: 50,
        })
      )
  );

  // 4. Dynamic resource template: Delivery issues, policy disapprovals, and warnings
  server.registerResource(
    "account_issues",
    new ResourceTemplate("meta-ads://account/{act_id}/issues", {
      list: async () => {
        const accounts = await fetchAccessibleAccounts();
        return {
          resources: accounts.map((acc) => ({
            uri: `meta-ads://account/${acc.id}/issues`,
            name: `account_issues_${acc.id}`,
            title: acc.name
              ? `Issues & Warnings: ${acc.name} (${acc.id})`
              : `Issues & Warnings (${acc.id})`,
            description: `Campaigns, ad sets, and ads with delivery issues or policy disapprovals in ad account ${
              acc.name ? `${acc.name} (${acc.id})` : acc.id
            }.`,
            mimeType: "application/json",
          })),
        };
      },
    }),
    {
      title: "Meta Ad Account Issues & Warnings",
      mimeType: "application/json",
      description:
        "Campaigns, ad sets, and ads with delivery issues, policy disapprovals, or pending review in an account (e.g. meta-ads://account/act_123456/issues).",
    },
    (uri, { act_id }) =>
      readJsonResource(uri, async () => {
        const accountId = parseAccountId(act_id);
        const [campaignsResult, adsetsResult, adsResult] = await Promise.all([
          fetchEdge(accountId, "campaigns", {
            effective_status: ["WITH_ISSUES"],
            fields: ISSUE_CAMPAIGN_FIELDS,
            limit: 50,
          }),
          fetchEdge(accountId, "adsets", {
            effective_status: ["WITH_ISSUES", "PENDING_REVIEW"],
            fields: ISSUE_ADSET_FIELDS,
            limit: 50,
          }),
          fetchEdge(accountId, "ads", {
            effective_status: ["DISAPPROVED", "WITH_ISSUES", "PENDING_REVIEW"],
            fields: ISSUE_AD_FIELDS,
            limit: 50,
          }),
        ]);
        return {
          campaigns: (campaignsResult as { data?: unknown[] })?.data ?? [],
          adsets: (adsetsResult as { data?: unknown[] })?.data ?? [],
          ads: (adsResult as { data?: unknown[] })?.data ?? [],
        };
      })
  );
}
