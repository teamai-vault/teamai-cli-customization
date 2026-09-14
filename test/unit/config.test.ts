import { describe, expect, test } from "vitest";
import { readGlobalConfig, writeGlobalConfig } from "../../src/config/global.js";
import { createDefaultConfig } from "../../src/config/schema.js";
import { tempDir } from "../helpers/test-utils.js";

describe("global config", () => {
  test("reads and writes config.yaml", async () => {
    const home = await tempDir("team-ai-home-");
    const config = createDefaultConfig("test-org/teamai-marketplace");
    config.role = "api";
    config.managedPlugins = ["common@teamai", "role-api@teamai"];
    await writeGlobalConfig(config, home);
    await expect(readGlobalConfig(home)).resolves.toEqual(config);
  });
});
