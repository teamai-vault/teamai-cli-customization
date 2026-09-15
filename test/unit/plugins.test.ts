import { describe, expect, test } from "vitest";
import { createDefaultConfig, MARKETPLACE_NAME } from "../../src/config/schema.js";
import type { CopilotClient } from "../../src/copilot/cli.js";
import { convergeUserPlugins, desiredUserPlugins } from "../../src/copilot/plugins.js";

describe("desired plugin resolution", () => {
  test("resolves common plus selected role", () => {
    expect(desiredUserPlugins("api", MARKETPLACE_NAME)).toEqual([
      `common@${MARKETPLACE_NAME}`,
      `role-api@${MARKETPLACE_NAME}`,
    ]);
  });

  test("supports the design role", () => {
    expect(desiredUserPlugins("design", MARKETPLACE_NAME)).toEqual([
      `common@${MARKETPLACE_NAME}`,
      `role-design@${MARKETPLACE_NAME}`,
    ]);
  });

  test("validates a required product before listing or mutating plugins", async () => {
    let marketplaceRegistered = false;
    let pluginsListed = false;
    const client = {
      listMarketplaces: async () => [],
      addMarketplace: async () => { marketplaceRegistered = true; },
      removeMarketplace: async () => { marketplaceRegistered = false; },
      browseMarketplace: async () => [],
      listPlugins: async () => {
        pluginsListed = true;
        throw new Error("plugin list failed");
      },
    } as unknown as CopilotClient;
    const config = createDefaultConfig("test-org/teamai-marketplace");
    config.role = "api";

    await expect(convergeUserPlugins(client, config, { requiredCatalogPlugin: "product-missing" }))
      .rejects.toThrow("Product plugin product-missing@teamai is not present");
    expect(pluginsListed).toBe(false);
    expect(marketplaceRegistered).toBe(false);
  });
});
