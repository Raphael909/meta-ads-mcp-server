import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FB_GRAPH_URL, DEFAULT_AD_ACCOUNT_FIELDS } from "./constants.js";
import {
  getAccessToken,
  makeGraphApiCall,
  fetchNode,
  fetchEdge,
  handleApiError,
} from "./services/graph-api.js";

/**
 * Register MCP Resources providing zero-shot context to AI models.
 *
 * Resources expose read-only state directly into the LLM context window without
 * requiring the model to trigger multiple discovery tool calls:
 * - meta-ads://accounts (list of accessible accounts with currency & spend)
 * - meta-ads://account/{act_id}/overview (account details and status)
 * - meta-ads://account/{act_id}/active-campaigns (currently running campaigns & budgets)
 * - meta-ads://account/{act_id}/issues (delivery warnings, rejected ads, pending reviews)
 */
export function registerResources(server: McpServer): void {
  // 1. Static resource: List all accessible ad accounts
  server.registerResource(
    "ad_accounts",
    "meta-ads://accounts",
    {
      mimeType: "application/json",
      description:
        "List of all Meta ad accounts accessible with the current access token, including account ID, name, status, currency, spend, and balance.",
    },
    async (uri) => {
      try {
        const token = getAccessToken();
        const url = `${FB_GRAPH_URL}/me`;
        const data = await makeGraphApiCall(url, {
          access_token: token,
          fields: "adaccounts{id,name,account_id,account_status,currency,amount_spent,balance}",
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: handleApiError(error),
            },
          ],
        };
      }
    }
  );

  // 2. Dynamic resource template: Specific ad account overview
  server.registerResource(
    "account_overview",
    new ResourceTemplate("meta-ads://account/{act_id}/overview", { list: undefined }),
    {
      mimeType: "application/json",
      description:
        "Detailed profile and settings for a specific ad account (e.g. meta-ads://account/act_123456/overview).",
    },
    async (uri, { act_id }) => {
      try {
        const accountId = String(act_id);
        const data = await fetchNode(accountId, { fields: DEFAULT_AD_ACCOUNT_FIELDS });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: handleApiError(error),
            },
          ],
        };
      }
    }
  );

  // 3. Dynamic resource template: Active campaigns in an ad account
  server.registerResource(
    "active_campaigns",
    new ResourceTemplate("meta-ads://account/{act_id}/active-campaigns", { list: undefined }),
    {
      mimeType: "application/json",
      description:
        "Currently active campaigns in an ad account with objective, budgets, and bid strategy (e.g. meta-ads://account/act_123456/active-campaigns).",
    },
    async (uri, { act_id }) => {
      try {
        const accountId = String(act_id);
        const data = await fetchEdge(accountId, "campaigns", {
          effective_status: ["ACTIVE"],
          fields: [
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
          ],
          limit: 50,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: handleApiError(error),
            },
          ],
        };
      }
    }
  );

  // 4. Dynamic resource template: Delivery issues, disapprovals, and warnings
  server.registerResource(
    "account_issues",
    new ResourceTemplate("meta-ads://account/{act_id}/issues", { list: undefined }),
    {
      mimeType: "application/json",
      description:
        "Ads and ad sets with delivery issues, policy disapprovals, or pending review in an account (e.g. meta-ads://account/act_123456/issues).",
    },
    async (uri, { act_id }) => {
      try {
        const accountId = String(act_id);
        const data = await fetchEdge(accountId, "ads", {
          effective_status: ["DISAPPROVED", "WITH_ISSUES", "PENDING_REVIEW"],
          fields: [
            "id",
            "name",
            "status",
            "effective_status",
            "issues_info",
            "adset_id",
            "campaign_id",
            "created_time",
            "updated_time",
          ],
          limit: 50,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: handleApiError(error),
            },
          ],
        };
      }
    }
  );
}
