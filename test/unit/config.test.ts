import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { configPath, readGlobalConfig, writeGlobalConfig } from "../../src/config/global.js";
import { createConfig } from "../../src/config/schema.js";
import { tempDir, TEST_MARKETPLACE_NAME, TEST_MARKETPLACE_SOURCE } from "../helpers/test-utils.js";

describe("global config", () => {
  test("reads and writes config.yaml", async () => {
    const home = await tempDir("team-ai-home-");
    const config = createConfig({ name: TEST_MARKETPLACE_NAME, source: TEST_MARKETPLACE_SOURCE });
    config.role = "api";
    config.managedPlugins = [`common@${TEST_MARKETPLACE_NAME}`, `role-api@${TEST_MARKETPLACE_NAME}`];
    await writeGlobalConfig(config, home);
    await expect(readGlobalConfig(home)).resolves.toEqual(config);
  });

  test("migrates v1 marketplace.repository to v2 marketplace.source in memory", async () => {
    const home = await tempDir("team-ai-v1-home-");
    await mkdir(path.dirname(configPath(home)), { recursive: true });
    await writeFile(configPath(home), [
      "version: 1",
      "marketplace:",
      `  name: ${TEST_MARKETPLACE_NAME}`,
      `  repository: ${TEST_MARKETPLACE_SOURCE}`,
      "role: api",
      "managedPlugins: []",
      "",
    ].join("\n"), "utf8");

    await expect(readGlobalConfig(home)).resolves.toEqual({
      version: 2,
      marketplace: { name: TEST_MARKETPLACE_NAME, source: TEST_MARKETPLACE_SOURCE },
      role: "api",
      managedPlugins: [],
    });
  });
});
