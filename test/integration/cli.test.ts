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
  loadFakeMarketplace,
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
      loadMarketplace: loadFakeMarketplace,
      out: output.out,
      err: output.err,
    })).toBe(1);

    expect(await readGlobalConfig(home)).toBeUndefined();
    expect(output.stderr.some((line) => line.includes("--marketplace <source>"))).toBe(true);
  }, 10_000);

  test("non-interactive init reports each missing required value", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-no-role-home-");
    const fake = await createFakeCopilot();
    const output = capture();

    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      loadMarketplace: loadFakeMarketplace,
      out: output.out,
      err: output.err,
    })).toBe(1);
    expect(output.stderr.some((line) => line.includes("Role is required in non-interactive mode"))).toBe(true);
  }, 10_000);

  test("interactive init prompts only for missing values", async () => {
    const cases = [
      { args: ["init"], marketplacePrompts: 1, rolePrompts: 1 },
      { args: ["init", "--marketplace", TEST_MARKETPLACE_SOURCE], marketplacePrompts: 0, rolePrompts: 1 },
      { args: ["init", "--role", "qa"], marketplacePrompts: 1, rolePrompts: 0 },
    ];
    for (const item of cases) {
      const repo = await createGitRepo();
      const home = await tempDir("team-ai-interactive-home-");
      const fake = await createFakeCopilot();
      const output = capture();
      let marketplacePrompts = 0;
      let rolePrompts = 0;
      expect(await runCli(item.args, {
        cwd: repo,
        homeDir: home,
        copilot: fake.client,
        interactive: true,
        loadMarketplace: loadFakeMarketplace,
        promptMarketplace: async () => { marketplacePrompts += 1; return TEST_MARKETPLACE_SOURCE; },
        promptRole: async () => { rolePrompts += 1; return "qa"; },
        out: output.out,
        err: output.err,
      })).toBe(0);
      expect(marketplacePrompts).toBe(item.marketplacePrompts);
      expect(rolePrompts).toBe(item.rolePrompts);
      expect((await readGlobalConfig(home))?.role).toBe("qa");
    }
  }, 30_000);

  test("init discovers marketplace name from Copilot and remains repeatable", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-home-");
    const fake = await createFakeCopilot({
      plugins: [
        { name: "personal-tool", marketplace: "other", version: "9.9.9", enabled: true, source: "user" },
        { name: "api", marketplace: "other", version: "8.8.8", enabled: true, source: "user" },
      ],
    });
    const first = capture();
    const base = { cwd: repo, homeDir: home, copilot: fake.client, loadMarketplace: loadFakeMarketplace, out: first.out, err: first.err };

    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api"], base)).toBe(0);
    expect(first.stderr).toEqual([]);
    const config = await readGlobalConfig(home);
    expect(config?.version).toBe(1);
    expect(config?.marketplace).toEqual({ name: TEST_MARKETPLACE_NAME, source: TEST_MARKETPLACE_SOURCE });
    expect(config?.role).toBe("api");
    expect(config?.managedPlugins).toEqual([
      `aos@${TEST_MARKETPLACE_NAME}`,
      `api@${TEST_MARKETPLACE_NAME}`,
      `common@${TEST_MARKETPLACE_NAME}`,
      `design@${TEST_MARKETPLACE_NAME}`,
      `ios@${TEST_MARKETPLACE_NAME}`,
      `qa@${TEST_MARKETPLACE_NAME}`,
    ]);

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
    expect(afterReinit.plugins.find((item) => item.name === "api" && item.marketplace === TEST_MARKETPLACE_NAME)?.enabled).toBe(false);
    expect(afterReinit.plugins.find((item) => item.name === "ios" && item.marketplace === TEST_MARKETPLACE_NAME)?.enabled).toBe(true);

    const switched = capture();
    expect(await runCli(["role", "set", "qa"], { ...base, out: switched.out, err: switched.err })).toBe(0);
    const afterSwitch = await fake.readState();
    expect(afterSwitch.plugins.find((item) => item.name === "api" && item.marketplace === TEST_MARKETPLACE_NAME)?.enabled).toBe(false);
    expect(afterSwitch.plugins.find((item) => item.name === "qa")?.enabled).toBe(true);
    expect(afterSwitch.plugins.find((item) => item.name === "personal-tool")?.enabled).toBe(true);
    expect(afterSwitch.plugins.find((item) => item.name === "api" && item.marketplace === "other")?.enabled).toBe(true);

    const synced = capture();
    expect(await runCli(["sync"], { ...base, out: synced.out, err: synced.err })).toBe(0);
    expect(synced.stdout).toContain("Copilot plugin state is already converged.");

    const status = capture();
    expect(await runCli(["status"], { ...base, out: status.out, err: status.err })).toBe(0);
    expect(status.stdout.some((line) => line.includes(`qa@${TEST_MARKETPLACE_NAME}: enabled`))).toBe(true);

    const doctor = capture();
    expect(await runCli(["doctor"], { ...base, out: doctor.out, err: doctor.err })).toBe(0);
    expect(doctor.stdout.some((line) => line.includes(`qa@${TEST_MARKETPLACE_NAME} is enabled.`))).toBe(true);
  }, 30_000);

  test("first-time dry-run discovers metadata without mutating Copilot", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-dry-home-");
    const fake = await createFakeCopilot();
    const before = await fake.readState();
    const output = capture();

    expect(await runCli(["--dry-run", "init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      loadMarketplace: loadFakeMarketplace,
      out: output.out,
      err: output.err,
    })).toBe(0);

    expect(await fake.readState()).toEqual(before);
    expect(await readGlobalConfig(home)).toBeUndefined();
    expect(output.stdout).toContain(`WOULD marketplace-add: ${TEST_MARKETPLACE_SOURCE}`);
    expect(output.stdout).toContain(`WOULD plugin-install: api@${TEST_MARKETPLACE_NAME}`);
  }, 10_000);

  test("refuses a different marketplace source after initialization", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-switch-home-");
    const fake = await createFakeCopilot();
    const first = capture();
    const base = { cwd: repo, homeDir: home, copilot: fake.client, loadMarketplace: loadFakeMarketplace, out: first.out, err: first.err };

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
      plugins: [{ name: "api", marketplace: TEST_MARKETPLACE_NAME, version: "0.0.1", enabled: false, source: `marketplace:${TEST_MARKETPLACE_NAME}` }],
    });
    const output = capture();

    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      loadMarketplace: loadFakeMarketplace,
      out: output.out,
      err: output.err,
    })).toBe(0);

    const state = await fake.readState();
    expect(state.plugins.find((item) => item.name === "api")).toMatchObject({ version: "0.0.1", enabled: false });
    const config = await readGlobalConfig(home);
    expect(config?.managedPlugins).not.toContain(`api@${TEST_MARKETPLACE_NAME}`);
    expect(config?.managedPlugins).toHaveLength(5);
    expect(output.stdout.some((line) => line.includes("not Team AI managed"))).toBe(true);
  }, 10_000);

  test("warns when an enabled desired plugin remains user-owned", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-enabled-owned-home-");
    const fake = await createFakeCopilot({
      marketplaces: [{ name: TEST_MARKETPLACE_NAME, source: TEST_MARKETPLACE_SOURCE }],
      plugins: [{ name: "api", marketplace: TEST_MARKETPLACE_NAME, version: "0.1.0", enabled: true, source: `marketplace:${TEST_MARKETPLACE_NAME}` }],
    });
    const output = capture();

    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      loadMarketplace: loadFakeMarketplace,
      out: output.out,
      err: output.err,
    })).toBe(0);

    expect((await fake.readState()).plugins.find((item) => item.name === "api")).toMatchObject({ version: "0.1.0", enabled: true });
    expect((await readGlobalConfig(home))?.managedPlugins).not.toContain(`api@${TEST_MARKETPLACE_NAME}`);
    expect(output.stdout.some((line) => line.includes("not Team AI managed"))).toBe(true);
  }, 10_000);

  test("claims disabled live-marketplace projections by installing the desired plugins", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-live-marketplace-home-");
    const fake = await createFakeCopilot({
      marketplaces: [{ name: TEST_MARKETPLACE_NAME, source: TEST_MARKETPLACE_SOURCE }],
      plugins: [
        { name: "common", marketplace: TEST_MARKETPLACE_NAME, version: "0.1.0", enabled: false, source: `live-marketplace:${TEST_MARKETPLACE_NAME}` },
        { name: "design", marketplace: TEST_MARKETPLACE_NAME, version: "0.1.0", enabled: false, source: `live-marketplace:${TEST_MARKETPLACE_NAME}` },
      ],
    });
    const output = capture();

    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "design"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      loadMarketplace: loadFakeMarketplace,
      out: output.out,
      err: output.err,
    })).toBe(0);

    const state = await fake.readState();
    expect(state.plugins.find((item) => item.name === "common")?.enabled).toBe(true);
    expect(state.plugins.find((item) => item.name === "design")?.enabled).toBe(true);
    const config = await readGlobalConfig(home);
    expect(config?.managedPlugins).toHaveLength(6);
    expect(output.stdout.filter((line) => line.includes("plugin-install")).length).toBe(6);
  }, 10_000);

  test("validates a product plugin against the marketplace before writing repository settings", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-product-home-");
    const fake = await createFakeCopilot({
      catalog: {
        [TEST_MARKETPLACE_NAME]: [
          { name: "common", version: "0.1.0" },
          { name: "api", version: "0.1.0" },
          { name: "product-teamai", version: "0.1.0" },
        ],
      },
    });
    const output = capture();

    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api", "--product", "teamai"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      loadMarketplace: loadFakeMarketplace,
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
      loadMarketplace: loadFakeMarketplace,
      out: output.out,
      err: output.err,
    })).toBe(1);
    expect(await fake.readState()).toEqual(before);
    expect(await readGlobalConfig(home)).toBeUndefined();
    await expect(readFile(path.join(repo, ".github", "copilot", "settings.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(output.stderr.some((line) => line.includes("is not present in the Marketplace"))).toBe(true);
  }, 10_000);

  test("doctor rejects a declared product when a readable catalog is empty", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-empty-catalog-home-");
    const config = createConfig({ name: TEST_MARKETPLACE_NAME, source: TEST_MARKETPLACE_SOURCE });
    config.role = "api";
    config.managedPlugins = [`common@${TEST_MARKETPLACE_NAME}`, `api@${TEST_MARKETPLACE_NAME}`];
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
        { name: "api", marketplace: TEST_MARKETPLACE_NAME, version: "0.1.0", enabled: true },
      ],
      catalog: { [TEST_MARKETPLACE_NAME]: [] },
    });
    const output = capture();

    expect(await runCli(["doctor"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      loadMarketplace: loadFakeMarketplace,
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
      loadMarketplace: loadFakeMarketplace,
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
      loadMarketplace: loadFakeMarketplace,
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
      loadMarketplace: loadFakeMarketplace,
      out: output.out,
      err: output.err,
    })).toBe(1);
    expect(output.stdout).toContain("✗ Native MCP inspection: broken MCP declaration");
  }, 10_000);

  test("init mirrors nested user instructions byte-for-byte and preserves personal files", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-instructions-init-home-");
    const marketplace = await tempDir("team-ai-instructions-init-marketplace-");
    const source = path.join(marketplace, "user-instructions");
    await mkdir(path.join(source, "git"), { recursive: true });
    await writeFile(path.join(source, "global.instructions.md"), Buffer.from("global\r\n\0", "utf8"));
    await writeFile(path.join(source, "git", "commit.instructions.md"), "commit rules\n", "utf8");
    const personalPath = path.join(home, ".copilot", "instructions", "personal.instructions.md");
    const rootPersonalPath = path.join(home, ".copilot", "copilot-instructions.md");
    await mkdir(path.dirname(personalPath), { recursive: true });
    await writeFile(personalPath, "personal\n", "utf8");
    await writeFile(rootPersonalPath, "root personal\n", "utf8");
    const fake = await createFakeCopilot();
    const output = capture();

    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      loadMarketplace: async () => loadFakeMarketplace(marketplace),
      out: output.out,
      err: output.err,
    })).toBe(0);

    const target = path.join(home, ".copilot", "instructions", "team-ai");
    expect(await readFile(path.join(target, "global.instructions.md"))).toEqual(Buffer.from("global\r\n\0", "utf8"));
    expect(await readFile(path.join(target, "git", "commit.instructions.md"), "utf8")).toBe("commit rules\n");
    expect(await readFile(personalPath, "utf8")).toBe("personal\n");
    expect(await readFile(rootPersonalPath, "utf8")).toBe("root personal\n");
    expect(output.stdout).toContain("DONE create: ~/.copilot/instructions/team-ai/global.instructions.md");
    expect(output.stdout.join("\n")).not.toContain("commit rules");
  }, 15_000);

  test("sync converges changes and dry-run performs no instruction writes", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-instructions-sync-home-");
    const marketplace = await tempDir("team-ai-instructions-sync-marketplace-");
    const source = path.join(marketplace, "user-instructions");
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, "global.instructions.md"), "v1\n", "utf8");
    const fake = await createFakeCopilot();
    const loadMarketplace = async () => loadFakeMarketplace(marketplace);
    const base = { cwd: repo, homeDir: home, copilot: fake.client, loadMarketplace };
    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api"], { ...base, ...capture() })).toBe(0);

    const target = path.join(home, ".copilot", "instructions", "team-ai");
    await writeFile(path.join(source, "global.instructions.md"), "v2\n", "utf8");
    await writeFile(path.join(source, "nested.instructions.md"), "new body\n", "utf8");
    await writeFile(path.join(target, "global.instructions.md"), "local edit\n", "utf8");
    const dry = capture();
    expect(await runCli(["--dry-run", "sync"], { ...base, out: dry.out, err: dry.err })).toBe(0);
    expect(await readFile(path.join(target, "global.instructions.md"), "utf8")).toBe("local edit\n");
    expect(await readFile(path.join(target, "nested.instructions.md")).catch((error: NodeJS.ErrnoException) => error.code)).toBe("ENOENT");
    expect(dry.stdout).toContain("WOULD update: ~/.copilot/instructions/team-ai/global.instructions.md");
    expect(dry.stdout).not.toContain("new body");

    const actual = capture();
    expect(await runCli(["sync"], { ...base, out: actual.out, err: actual.err })).toBe(0);
    expect(await readFile(path.join(target, "global.instructions.md"), "utf8")).toBe("v2\n");
    expect(await readFile(path.join(target, "nested.instructions.md"), "utf8")).toBe("new body\n");
  }, 20_000);

  test("status and doctor report current and stale managed instructions", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-instructions-doctor-home-");
    const marketplace = await tempDir("team-ai-instructions-doctor-marketplace-");
    const source = path.join(marketplace, "user-instructions");
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, "global.instructions.md"), "global\n", "utf8");
    const fake = await createFakeCopilot();
    const loadMarketplace = async () => loadFakeMarketplace(marketplace);
    const base = { cwd: repo, homeDir: home, copilot: fake.client, loadMarketplace };
    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api"], { ...base, ...capture() })).toBe(0);

    const status = capture();
    expect(await runCli(["status"], { ...base, out: status.out, err: status.err })).toBe(0);
    expect(status.stdout.some((line) => line.includes("User instructions: 1 managed, current"))).toBe(true);

    await writeFile(path.join(home, ".copilot", "instructions", "team-ai", "global.instructions.md"), "modified\n", "utf8");
    const doctor = capture();
    expect(await runCli(["doctor"], { ...base, out: doctor.out, err: doctor.err })).toBe(0);
    expect(doctor.stdout.some((line) => line.includes("Managed user instructions: stale"))).toBe(true);

    const staleStatus = capture();
    expect(await runCli(["status"], { ...base, out: staleStatus.out, err: staleStatus.err })).toBe(0);
    expect(staleStatus.stdout.some((line) => line.includes("User instructions: stale"))).toBe(true);
  }, 20_000);

  test("sync keeps installed instructions when Marketplace acquisition fails", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-instructions-failure-home-");
    const marketplace = await tempDir("team-ai-instructions-failure-marketplace-");
    const source = path.join(marketplace, "user-instructions");
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, "global.instructions.md"), "keep me\n", "utf8");
    const fake = await createFakeCopilot();
    const base = { cwd: repo, homeDir: home, copilot: fake.client, loadMarketplace: async () => loadFakeMarketplace(marketplace) };
    expect(await runCli(["init", "--marketplace", TEST_MARKETPLACE_SOURCE, "--role", "api"], { ...base, ...capture() })).toBe(0);

    const failingOutput = capture();
    expect(await runCli(["sync"], {
      ...base,
      loadMarketplace: async () => { throw new Error("Marketplace acquisition failed"); },
      out: failingOutput.out,
      err: failingOutput.err,
    })).toBe(1);
    expect(await readFile(path.join(home, ".copilot", "instructions", "team-ai", "global.instructions.md"), "utf8")).toBe("keep me\n");
    expect(failingOutput.stderr.some((line) => line.includes("Marketplace acquisition failed"))).toBe(true);
  }, 15_000);
});
