import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { loadMarketplaceCatalog, TEAM_AI_EXTENSION_NAMESPACE } from "../../src/copilot/catalog.js";
import { tempDir } from "../helpers/test-utils.js";

async function createMarketplace(roleKind: string = "role"): Promise<string> {
  const root = await tempDir("team-ai-catalog-");
  await mkdir(path.join(root, ".github", "plugin"), { recursive: true });
  for (const [name, kind] of [["common", "common"], ["api", roleKind]]) {
    await mkdir(path.join(root, "plugins", name), { recursive: true });
    await writeFile(path.join(root, "plugins", name, "plugin.json"), JSON.stringify({
      name,
      version: "0.1.0",
      extensions: { [TEAM_AI_EXTENSION_NAMESPACE]: { kind } },
    }), "utf8");
  }
  await writeFile(path.join(root, ".github", "plugin", "marketplace.json"), JSON.stringify({
    name: "test-marketplace",
    plugins: ["common", "api"].map((name) => ({ name, version: "0.1.0", source: `./plugins/${name}` })),
  }), "utf8");
  return root;
}

describe("Team AI Marketplace catalog", () => {
  test("discovers bare role names from extension metadata", async () => {
    const root = await createMarketplace();
    const catalog = await loadMarketplaceCatalog(root, process.cwd());
    expect(catalog.name).toBe("test-marketplace");
    expect(catalog.plugins.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "common", kind: "common" },
      { name: "api", kind: "role" },
    ]);
    await catalog.dispose();
  });

  test("rejects plugins without a supported Team AI kind", async () => {
    const root = await createMarketplace("other");
    await expect(loadMarketplaceCatalog(root, process.cwd())).rejects.toThrow(
      `extensions.${TEAM_AI_EXTENSION_NAMESPACE}.kind`,
    );
  });
});
