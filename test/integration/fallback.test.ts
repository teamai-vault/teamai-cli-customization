import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { runCli } from "../../src/cli.js";
import { readGlobalConfig } from "../../src/config/global.js";
import { CopilotClient } from "../../src/copilot/cli.js";
import { copilotConfigPath, copilotSettingsPath, installedPluginsRoot, registerMarketplaceState } from "../../src/copilot/user-state.js";
import { createGitRepo, tempDir } from "../helpers/test-utils.js";

async function createMarketplace(): Promise<string> {
  const root = await tempDir("team-ai-fallback-marketplace-");
  await mkdir(path.join(root, ".github", "plugin"), { recursive: true });
  const plugins = [
    { name: "common", kind: "common" },
    { name: "api", kind: "role" },
    { name: "qa", kind: "role" },
    { name: "payments", kind: "product" },
  ];
  for (const plugin of plugins) {
    const pluginRoot = path.join(root, "plugins", plugin.name);
    await mkdir(pluginRoot, { recursive: true });
    await writeFile(path.join(pluginRoot, "plugin.json"), JSON.stringify({
      name: plugin.name,
      version: "0.1.0",
      extensions: { "com.company.teamai": { kind: plugin.kind } },
    }), "utf8");
    await writeFile(path.join(pluginRoot, "content.txt"), plugin.name, "utf8");
  }
  await writeFile(path.join(root, ".github", "plugin", "marketplace.json"), JSON.stringify({
    name: "fallback-team-ai",
    plugins: plugins.map((plugin) => ({ name: plugin.name, version: "0.1.0", source: `./plugins/${plugin.name}` })),
  }), "utf8");
  return root;
}

describe("VS Code-only Copilot fallback", () => {
  test("materializes all user plugins and keeps Copilot enablement metadata synchronized", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-fallback-home-");
    const marketplace = await createMarketplace();
    const configPath = copilotConfigPath(home);
    const settingsPath = copilotSettingsPath(home);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({ nativeField: "keep", installedPlugins: [{ name: "personal", marketplace: "other", enabled: true, source_sha: "keep" }] }), "utf8");
    const initialSettings = {
      unknownSetting: true,
      enabledPlugins: { "personal@other": true },
      extraKnownMarketplaces: {
        "fallback-team-ai": {
          source: { source: "github", repo: "old/source", nativeField: "keep" },
          entryField: "keep",
        },
      },
    };
    registerMarketplaceState(initialSettings, "fallback-team-ai", marketplace);
    await writeFile(settingsPath, JSON.stringify(initialSettings), "utf8");
    const vscodePath = path.join(home, "Code", "settings.json");
    await mkdir(path.dirname(vscodePath), { recursive: true });
    await writeFile(vscodePath, `{
  // keep
  "chat.plugins.marketplaces": ["existing",],
}
`, "utf8");
    const base = {
      cwd: repo,
      homeDir: home,
      copilot: new CopilotClient("team-ai-command-that-does-not-exist"),
      vscodeAvailable: async () => true,
      vscodeSettingsPath: vscodePath,
      now: () => new Date("2026-09-15T00:00:00.000Z"),
      out: () => undefined,
      err: () => undefined,
    };

    expect(await runCli(["init", "--marketplace", marketplace, "--role", "api"], base)).toBe(0);
    expect((await readGlobalConfig(home))?.managedPlugins).toEqual([
      "api@fallback-team-ai",
      "common@fallback-team-ai",
      "qa@fallback-team-ai",
    ]);

    const copilotConfig = JSON.parse(await readFile(configPath, "utf8"));
    const copilotSettings = JSON.parse(await readFile(settingsPath, "utf8"));
    expect(copilotConfig.nativeField).toBe("keep");
    expect(copilotConfig.installedPlugins).toHaveLength(4);
    expect(copilotConfig.installedPlugins.find((item: { name: string }) => item.name === "personal").source_sha).toBe("keep");
    for (const name of ["common", "api", "qa"]) {
      const installed = copilotConfig.installedPlugins.find((item: { name: string }) => item.name === name);
      expect(installed).toMatchObject({
        marketplace: "fallback-team-ai",
        version: "0.1.0",
        installed_at: "2026-09-15T00:00:00.000Z",
      });
      expect(installed.source_sha).toBeUndefined();
    }
    expect(copilotSettings.unknownSetting).toBe(true);
    expect(copilotSettings.enabledPlugins).toMatchObject({
      "personal@other": true,
      "common@fallback-team-ai": true,
      "api@fallback-team-ai": true,
      "qa@fallback-team-ai": false,
    });
    expect(copilotSettings.extraKnownMarketplaces["fallback-team-ai"].source.path).toBe(marketplace);
    expect(copilotSettings.extraKnownMarketplaces["fallback-team-ai"].source.nativeField).toBe("keep");
    expect(copilotSettings.extraKnownMarketplaces["fallback-team-ai"].source.repo).toBeUndefined();
    expect(copilotSettings.extraKnownMarketplaces["fallback-team-ai"].entryField).toBe("keep");
    await expect(readFile(path.join(installedPluginsRoot(home), "fallback-team-ai", "qa", "content.txt"), "utf8")).resolves.toBe("qa");

    expect(await runCli(["role", "set", "qa"], base)).toBe(0);
    const switchedConfig = JSON.parse(await readFile(configPath, "utf8"));
    const switchedSettings = JSON.parse(await readFile(settingsPath, "utf8"));
    expect(switchedSettings.enabledPlugins["api@fallback-team-ai"]).toBe(false);
    expect(switchedSettings.enabledPlugins["qa@fallback-team-ai"]).toBe(true);
    expect(switchedConfig.installedPlugins.find((item: { name: string }) => item.name === "api").enabled).toBe(false);
    expect(switchedConfig.installedPlugins.find((item: { name: string }) => item.name === "qa").enabled).toBe(true);

    switchedConfig.installedPlugins.find((item: { name: string }) => item.name === "api").enabled = true;
    delete switchedConfig.installedPlugins.find((item: { name: string }) => item.name === "qa").enabled;
    await writeFile(configPath, JSON.stringify(switchedConfig), "utf8");
    expect(await runCli(["sync"], base)).toBe(0);
    const repairedConfig = JSON.parse(await readFile(configPath, "utf8"));
    expect(repairedConfig.installedPlugins.find((item: { name: string }) => item.name === "api").enabled).toBe(false);
    expect(repairedConfig.installedPlugins.find((item: { name: string }) => item.name === "qa").enabled).toBe(true);

    repairedConfig.installedPlugins = repairedConfig.installedPlugins.filter((item: { name: string }) => item.name !== "qa");
    await writeFile(configPath, JSON.stringify(repairedConfig), "utf8");
    expect(await runCli(["sync"], base)).toBe(0);
    expect(JSON.parse(await readFile(configPath, "utf8")).installedPlugins.some((item: { name: string }) => item.name === "qa")).toBe(true);
    expect(await runCli(["doctor"], base)).toBe(0);
    const vscode = await readFile(vscodePath, "utf8");
    expect(vscode).toContain("// keep");
    expect(vscode.indexOf(marketplace)).toBeLessThan(vscode.indexOf("existing"));
  }, 30_000);
});
