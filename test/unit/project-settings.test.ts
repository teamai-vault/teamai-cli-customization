import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { mergeProductPlugin, readProjectSettings, writeProjectSettings } from "../../src/copilot/project-settings.js";
import { tempDir } from "../helpers/test-utils.js";

describe("repository Copilot settings", () => {
  test("preserves unknown fields and unrelated plugins", async () => {
    const root = await tempDir("team-ai-settings-");
    const settingsPath = path.join(root, ".github", "copilot", "settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      customFutureField: { keep: true },
      enabledPlugins: { "user-plugin@other": true },
      extraKnownMarketplaces: { other: { source: { source: "github", repo: "other/repo" } } },
    }), "utf8");

    const current = await readProjectSettings(root);
    const merged = mergeProductPlugin(current, { name: "company-ai", repository: "acme/teamai-marketplace" }, "payments");
    await writeProjectSettings(root, merged);
    const persisted = JSON.parse(await readFile(settingsPath, "utf8"));

    expect(persisted.customFutureField).toEqual({ keep: true });
    expect(persisted.enabledPlugins["user-plugin@other"]).toBe(true);
    expect(persisted.enabledPlugins["product-payments@company-ai"]).toBe(true);
    expect(persisted.extraKnownMarketplaces.other).toBeDefined();
    expect(persisted.extraKnownMarketplaces["company-ai"]).toEqual({
      source: { source: "github", repo: "acme/teamai-marketplace" },
    });
  });

  test("reports invalid JSON clearly", async () => {
    const root = await tempDir("team-ai-settings-bad-");
    const settingsPath = path.join(root, ".github", "copilot", "settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, "{", "utf8");
    await expect(readProjectSettings(root)).rejects.toThrow("contains invalid JSON");
  });
});
