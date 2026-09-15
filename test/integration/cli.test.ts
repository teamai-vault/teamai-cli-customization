import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { runCli } from "../../src/cli.js";
import { readGlobalConfig, writeGlobalConfig } from "../../src/config/global.js";
import { createConfig } from "../../src/config/schema.js";
import { partitionPath } from "../../src/project/partition.js";
import { detectProjectIdentity } from "../../src/project/anchors.js";
import {
  createFakeCopilot,
  createGitRepo,
  tempDir,
  TEST_MARKETPLACE_NAME,
  TEST_MARKETPLACE_SOURCE,
} from "../helpers/test-utils.js";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, out: (line: string) => stdout.push(line), err: (line: string) => stderr.push(line) };
}

describe("CLI integration with fake Copilot executable", () => {
  test("first init requires an explicit marketplace source", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-no-marketplace-home-");
    const fake = await createFakeCopilot();
    const output = capture();

    expect(await runCli(["init", "--role", "api"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: output.out,
      err: output.err,
    })).toBe(1);

    expect(await readGlobalConfig(home)).toBeUndefined();
    expect(output.stderr.some((line) => line.includes("--marketplace <source>"))).toBe(true);
  }, 10_000);

  test("init discovers marketplace name from Copilot and remains repeatable", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-home-");
    const fake = await createFakeCopilot({
      plugins: [
        { name: "personal-tool", marketplace: "other", version: "9.9.9", enabled: true, source: "user" },
        { name: "role-api", marketplace: "other", version: "8.8.8", enabled: true, source: "user" },
      ],
    });
    const first = capture();
    const base = { cwd: repo, homeDir: home, copilot: fake.client, out: first.out, err: first.err };

    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api"], base)).toBe(0);
    expect(first.stderr).toEqual([]);
    const config = await readGlobalConfig(home);
    expect(config?.version).toBe(2);
    expect(config?.marketplace).toEqual({ name: TEST_MARKETPLACE_NAME, source: TEST_MARKETPLACE_SOURCE });
    expect(config?.role).toBe("api");
    expect(config?.managedPlugins).toEqual([`common@${TEST_MARKETPLACE_NAME}`, `role-api@${TEST_MARKETPLACE_NAME}`]);

    const identity = await detectProjectIdentity(repo);
    const statePath = path.join(partitionPath(identity!.projectAnchor, home), "state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    expect(state.workspaceRoot.toLowerCase()).toBe(repo.toLowerCase());

    const repeat = capture();
    expect(await runCli(["init"], { ...base, out: repeat.out, err: repeat.err })).toBe(0);
    expect(repeat.stdout).toContain("Copilot plugin state is already converged.");

    const reinitRole = capture();
    expect(await runCli(["init", "--role", "ios"], { ...base, out: reinitRole.out, err: reinitRole.err })).toBe(0);
    const afterReinit = await fake.readState();
    expect(afterReinit.plugins.find((item) => item.name === "role-api" && item.marketplace === TEST_MARKETPLACE_NAME)?.enabled).toBe(false);
    expect(afterReinit.plugins.find((item) => item.name === "role-ios" && item.marketplace === TEST_MARKETPLACE_NAME)?.enabled).toBe(true);

    const switched = capture();
    expect(await runCli(["role", "set", "qa"], { ...base, out: switched.out, err: switched.err })).toBe(0);
    const afterSwitch = await fake.readState();
    expect(afterSwitch.plugins.find((item) => item.name === "role-api" && item.marketplace === TEST_MARKETPLACE_NAME)?.enabled).toBe(false);
    expect(afterSwitch.plugins.find((item) => item.name === "role-qa")?.enabled).toBe(true);
    expect(afterSwitch.plugins.find((item) => item.name === "personal-tool")?.enabled).toBe(true);
    expect(afterSwitch.plugins.find((item) => item.name === "role-api" && item.marketplace === "other")?.enabled).toBe(true);

    const synced = capture();
    expect(await runCli(["sync"], { ...base, out: synced.out, err: synced.err })).toBe(0);
    expect(synced.stdout).toContain("Copilot plugin state is already converged.");

    const status = capture();
    expect(await runCli(["status"], { ...base, out: status.out, err: status.err })).toBe(0);
    expect(status.stdout.some((line) => line.includes(`role-qa@${TEST_MARKETPLACE_NAME}: enabled`))).toBe(true);

    const doctor = capture();
    expect(await runCli(["doctor"], { ...base, out: doctor.out, err: doctor.err })).toBe(0);
    expect(doctor.stdout.some((line) => line.includes(`role-qa@${TEST_MARKETPLACE_NAME} is enabled.`))).toBe(true);
  }, 30_000);

  test("first-time dry-run does not mutate Copilot when marketplace name is not discoverable", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-dry-home-");
    const fake = await createFakeCopilot();
    const before = await fake.readState();
    const output = capture();

    expect(await runCli(["--dry-run", "init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: output.out,
      err: output.err,
    })).toBe(0);

    expect(await fake.readState()).toEqual(before);
    expect(await readGlobalConfig(home)).toBeUndefined();
    expect(output.stdout).toContain(`WOULD marketplace-add: ${TEST_MARKETPLACE_SOURCE}`);
    expect(output.stdout.some((line) => line.includes("name discovery requires registration"))).toBe(true);
  }, 10_000);

  test("refuses a different marketplace source after initialization", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-switch-home-");
    const fake = await createFakeCopilot();
    const first = capture();
    const base = { cwd: repo, homeDir: home, copilot: fake.client, out: first.out, err: first.err };

    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api"], base)).toBe(0);

    const next = capture();
    expect(await runCli(["init", "--marketplace", "https://github.com/other-org/other-marketplace.git"], {
      ...base,
      out: next.out,
      err: next.err,
    })).toBe(1);
    expect(next.stderr.some((line) => line.includes("Refusing to switch Marketplace during init"))).toBe(true);
  }, 15_000);

  test("does not claim or mutate a pre-existing user-owned Team AI role plugin", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-owned-home-");
    const fake = await createFakeCopilot({
      marketplaces: [{ name: TEST_MARKETPLACE_NAME, source: TEST_MARKETPLACE_SOURCE }],
      plugins: [{ name: "role-api", marketplace: TEST_MARKETPLACE_NAME, version: "0.0.1", enabled: false, source: `marketplace:${TEST_MARKETPLACE_NAME}` }],
    });
    const output = capture();

    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: output.out,
      err: output.err,
    })).toBe(0);

    const state = await fake.readState();
    expect(state.plugins.find((item) => item.name === "role-api")).toMatchObject({ version: "0.0.1", enabled: false });
    const config = await readGlobalConfig(home);
    expect(config?.managedPlugins).toEqual([`common@${TEST_MARKETPLACE_NAME}`]);
    expect(output.stdout.some((line) => line.includes("not Team AI managed"))).toBe(true);
  }, 10_000);

  test("warns when an enabled desired plugin remains user-owned", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-enabled-owned-home-");
    const fake = await createFakeCopilot({
      marketplaces: [{ name: TEST_MARKETPLACE_NAME, source: TEST_MARKETPLACE_SOURCE }],
      plugins: [{ name: "role-api", marketplace: TEST_MARKETPLACE_NAME, version: "0.1.0", enabled: true, source: `marketplace:${TEST_MARKETPLACE_NAME}` }],
    });
    const output = capture();

    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: output.out,
      err: output.err,
    })).toBe(0);

    expect((await fake.readState()).plugins.find((item) => item.name === "role-api")).toMatchObject({ version: "0.1.0", enabled: true });
    expect((await readGlobalConfig(home))?.managedPlugins).toEqual([`common@${TEST_MARKETPLACE_NAME}`]);
    expect(output.stdout.some((line) => line.includes("not Team AI managed"))).toBe(true);
  }, 10_000);

  test("claims disabled live-marketplace projections by installing the desired plugins", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-live-marketplace-home-");
    const fake = await createFakeCopilot({
      marketplaces: [{ name: TEST_MARKETPLACE_NAME, source: TEST_MARKETPLACE_SOURCE }],
      plugins: [
        { name: "common", marketplace: TEST_MARKETPLACE_NAME, version: "0.1.0", enabled: false, source: `live-marketplace:${TEST_MARKETPLACE_NAME}` },
        { name: "role-design", marketplace: TEST_MARKETPLACE_NAME, version: "0.1.0", enabled: false, source: `live-marketplace:${TEST_MARKETPLACE_NAME}` },
      ],
    });
    const output = capture();

    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "design"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: output.out,
      err: output.err,
    })).toBe(0);

    const state = await fake.readState();
    expect(state.plugins.find((item) => item.name === "common")?.enabled).toBe(true);
    expect(state.plugins.find((item) => item.name === "role-design")?.enabled).toBe(true);
    const config = await readGlobalConfig(home);
    expect(config?.managedPlugins).toEqual([`common@${TEST_MARKETPLACE_NAME}`, `role-design@${TEST_MARKETPLACE_NAME}`]);
    expect(output.stdout.filter((line) => line.includes("plugin-install")).length).toBe(2);
  }, 10_000);

  test("validates a product plugin against the marketplace before writing repository settings", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-product-home-");
    const fake = await createFakeCopilot({
      catalog: {
        [TEST_MARKETPLACE_NAME]: [
          { name: "common", version: "0.1.0" },
          { name: "role-api", version: "0.1.0" },
          { name: "product-teamai", version: "0.1.0" },
        ],
      },
    });
    const output = capture();

    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api", "--product", "teamai"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: output.out,
      err: output.err,
    })).toBe(0);

    const settings = JSON.parse(await readFile(path.join(repo, ".github", "copilot", "settings.json"), "utf8"));
    expect(settings.enabledPlugins[`product-teamai@${TEST_MARKETPLACE_NAME}`]).toBe(true);
    expect(settings.extraKnownMarketplaces[TEST_MARKETPLACE_NAME]).toEqual({
      source: { source: "git", url: TEST_MARKETPLACE_SOURCE },
    });
  }, 10_000);

  test("refuses to write an unknown product plugin", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-product-missing-home-");
    const fake = await createFakeCopilot();
    const before = await fake.readState();
    const output = capture();

    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api", "--product", "missing"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: output.out,
      err: output.err,
    })).toBe(1);
    expect(await fake.readState()).toEqual(before);
    expect(await readGlobalConfig(home)).toBeUndefined();
    await expect(readFile(path.join(repo, ".github", "copilot", "settings.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(output.stderr.some((line) => line.includes("is not present in the marketplace"))).toBe(true);
  }, 10_000);

  test("doctor rejects a declared product when a readable catalog is empty", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-empty-catalog-home-");
    const config = createConfig({ name: TEST_MARKETPLACE_NAME, source: TEST_MARKETPLACE_SOURCE });
    config.role = "api";
    config.managedPlugins = [`common@${TEST_MARKETPLACE_NAME}`, `role-api@${TEST_MARKETPLACE_NAME}`];
    await writeGlobalConfig(config, home);
    const settingsPath = path.join(repo, ".github", "copilot", "settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      enabledPlugins: { [`product-teamai@${TEST_MARKETPLACE_NAME}`]: true },
    }), "utf8");
    const fake = await createFakeCopilot({
      marketplaces: [{ name: TEST_MARKETPLACE_NAME, source: TEST_MARKETPLACE_SOURCE }],
      plugins: [
        { name: "common", marketplace: TEST_MARKETPLACE_NAME, version: "0.1.0", enabled: true },
        { name: "role-api", marketplace: TEST_MARKETPLACE_NAME, version: "0.1.0", enabled: true },
      ],
      catalog: { [TEST_MARKETPLACE_NAME]: [] },
    });
    const output = capture();

    expect(await runCli(["doctor"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: output.out,
      err: output.err,
    })).toBe(1);
    expect(output.stdout).toContain(`✗ product-teamai@${TEST_MARKETPLACE_NAME} is not present in ${TEST_MARKETPLACE_NAME}.`);
  }, 10_000);

  test("status and doctor inspect native MCP without claiming Hook execution", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-capabilities-home-");
    const fake = await createFakeCopilot({
      mcpServers: [{ name: "shared-tools", enabled: true, source: "plugin:test-plugin" }],
    });

    const status = capture();
    expect(await runCli(["status"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: status.out,
      err: status.err,
    })).toBe(0);
    expect(status.stdout).toContain("  Native MCP servers: shared-tools");
    expect(status.stdout).toContain("  Native Plugin Hooks: declaration validation only; runtime inspection unavailable");

    const doctor = capture();
    expect(await runCli(["doctor"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: doctor.out,
      err: doctor.err,
    })).toBe(0);
    expect(doctor.stdout).toContain("✓ Native MCP inspection: shared-tools");
    expect(doctor.stdout).toContain("! Native Plugin Hook runtime inspection is unavailable; Team AI validates declarations but never executes Hooks.");
  }, 10_000);

  test("doctor reports native MCP inspection errors", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-mcp-error-home-");
    const fake = await createFakeCopilot({ mcpErrors: ["broken MCP declaration"] });
    const output = capture();

    expect(await runCli(["doctor"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: output.out,
      err: output.err,
    })).toBe(1);
    expect(output.stdout).toContain("✗ Native MCP inspection: broken MCP declaration");
  }, 10_000);
});
