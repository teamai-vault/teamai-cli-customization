import { describe, expect, test } from "vitest";
import { createConfig } from "../../src/config/schema.js";
import type { CatalogPlugin } from "../../src/copilot/catalog.js";
import type { CopilotClient } from "../../src/copilot/cli.js";
import { convergeUserPlugins, enabledUserPlugins, userPlugins } from "../../src/copilot/plugins.js";
import { TEST_MARKETPLACE_NAME, TEST_MARKETPLACE_SOURCE } from "../helpers/test-utils.js";

const catalog: CatalogPlugin[] = [
  { name: "common", version: "0.1.0", kind: "common", root: "common" },
  { name: "api", version: "0.1.0", kind: "role", root: "api" },
  { name: "qa", version: "0.1.0", kind: "role", root: "qa" },
  { name: "payments", version: "0.1.0", kind: "product", root: "payments" },
];

describe("desired plugin resolution", () => {
  test("installs common and every role but enables only common and the selected role", () => {
    expect(userPlugins(catalog, TEST_MARKETPLACE_NAME)).toEqual([
      `common@${TEST_MARKETPLACE_NAME}`,
      `api@${TEST_MARKETPLACE_NAME}`,
      `qa@${TEST_MARKETPLACE_NAME}`,
    ]);
    expect(enabledUserPlugins("qa", catalog, TEST_MARKETPLACE_NAME)).toEqual([
      `common@${TEST_MARKETPLACE_NAME}`,
      `qa@${TEST_MARKETPLACE_NAME}`,
    ]);
  });

  test("validates roles and product plugins by extension kind before mutation", async () => {
    let mutated = false;
    const client = {
      listMarketplaces: async () => [],
      addMarketplace: async () => { mutated = true; },
    } as unknown as CopilotClient;
    const config = createConfig({ name: TEST_MARKETPLACE_NAME, source: TEST_MARKETPLACE_SOURCE });
    config.role = "api";

    expect(() => enabledUserPlugins("payments", catalog, TEST_MARKETPLACE_NAME)).toThrow("Unknown role 'payments'");
    await expect(convergeUserPlugins(client, config, catalog, { requiredCatalogPlugin: "missing" }))
      .rejects.toThrow(`Product plugin missing@${TEST_MARKETPLACE_NAME} is not present`);
    expect(mutated).toBe(false);
  });
});
