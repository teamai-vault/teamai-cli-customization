import { describe, expect, test } from "vitest";
import { createConfig } from "../../src/config/schema.js";
import type { CopilotClient } from "../../src/copilot/cli.js";
import { convergeUserPlugins, desiredUserPlugins } from "../../src/copilot/plugins.js";
import { TEST_MARKETPLACE_NAME, TEST_MARKETPLACE_SOURCE } from "../helpers/test-utils.js";

describe("desired plugin resolution", () => {
  test("resolves common plus selected role", () => {
    expect(desiredUserPlugins("api", TEST_MARKETPLACE_NAME)).toEqual([
      `common@${TEST_MARKETPLACE_NAME}`,
      `role-api@${TEST_MARKETPLACE_NAME}`,
    ]);
  });

  test("supports the design role", () => {
    expect(desiredUserPlugins("design", TEST_MARKETPLACE_NAME)).toEqual([
      `common@${TEST_MARKETPLACE_NAME}`,
      `role-design@${TEST_MARKETPLACE_NAME}`,
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
    const config = createConfig({ name: TEST_MARKETPLACE_NAME, source: TEST_MARKETPLACE_SOURCE });
    config.role = "api";

    await expect(convergeUserPlugins(client, config, { requiredCatalogPlugin: "product-missing" }))
      .rejects.toThrow(`Product plugin product-missing@${TEST_MARKETPLACE_NAME} is not present`);
    expect(pluginsListed).toBe(false);
    expect(marketplaceRegistered).toBe(false);
  });
});
