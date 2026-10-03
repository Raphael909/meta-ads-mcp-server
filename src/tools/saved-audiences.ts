import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_SAVED_AUDIENCE_FIELDS } from "../constants.js";
import { fetchNode, fetchEdge, handleApiError } from "../services/graph-api.js";
import { FieldsSchema, FilteringSchema, PaginationSchema } from "../schemas/common.js";

const SAVED_AUDIENCE_FIELDS_DESC =
  "Fields to retrieve. Available: id, name, description, targeting, approximate_count_lower_bound, approximate_count_upper_bound, time_created, time_updated, run_status, account";

export function registerSavedAudienceTools(server: McpServer): void {
  server.registerTool(
    "meta_ads_get_saved_audiences_by_adaccount",
    {
      title: "Get Meta Saved Audiences by Ad Account",
      description: `Retrieve all saved audiences (saved targeting presets) from a specific Meta ad account with filtering and pagination.

Args:
  - act_id (string): Ad account ID prefixed with 'act_', e.g., 'act_1234567890'
  - fields (string[]): ${SAVED_AUDIENCE_FIELDS_DESC}
  - filtering (object[]): Additional filter objects with field, operator, value
  - limit (number): Results per page (1-100, default: 25)
  - after / before (string): Pagination cursors

Returns:
  Object with data (saved audience array) and paging info. Use meta_ads_fetch_pagination_url with paging.next for more results.

Examples:
  - Use when: "List all saved audiences for ad account act_123456"
  - Use when: "Find saved targeting presets in my account"`,
      inputSchema: z
        .object({
          act_id: z
            .string()
            .describe("Ad account ID prefixed with 'act_', e.g., 'act_1234567890'"),
          fields: FieldsSchema,
          filtering: FilteringSchema,
        })
        .merge(PaginationSchema),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ act_id, fields, filtering, limit, after, before, offset }) => {
      try {
        const effectiveFields =
          fields && fields.length > 0 ? fields : DEFAULT_SAVED_AUDIENCE_FIELDS;
        const data = await fetchEdge(act_id, "saved_audiences", {
          fields: effectiveFields,
          filtering,
          limit,
          after,
          before,
          offset,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data as Record<string, unknown>,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  server.registerTool(
    "meta_ads_get_saved_audience_by_id",
    {
      title: "Get Meta Saved Audience by ID",
      description: `Retrieve detailed targeting specifications and metadata for a specific Meta saved audience.

Useful for inspecting the exact targeting rules (geography, demographics, interests, exclusions) before applying them to an ad set.

Args:
  - saved_audience_id (string): The saved audience ID, e.g., '120330000123456789'
  - fields (string[]): ${SAVED_AUDIENCE_FIELDS_DESC}

Returns:
  Object with the saved audience fields, notably 'targeting' which contains the full targeting specification.

Examples:
  - Use when: "Get targeting specification for saved audience 120330000123456789"
  - Use when: "Inspect audience definition for saved audience ID 987654321"`,
      inputSchema: z.object({
        saved_audience_id: z
          .string()
          .describe("The saved audience ID, e.g., '120330000123456789'"),
        fields: FieldsSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ saved_audience_id, fields }) => {
      try {
        const effectiveFields =
          fields && fields.length > 0 ? fields : DEFAULT_SAVED_AUDIENCE_FIELDS;
        const data = await fetchNode(saved_audience_id, { fields: effectiveFields });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data as Record<string, unknown>,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
