import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { runCli } from "../../src/cli.js";
import { readGlobalConfig } from "../../src/config/global.js";
import { MARKETPLACE_NAME } from "../../src/config/schema.js";
import { partitionPath } from "../../src/project/partition.js";
import { detectProjectIdentity } from "../../src/project/anchors.js";
import { createFakeCopilot, createGitRepo, tempDir } from "../helpers/test-utils.js";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, out: (line: string) => stdout.push(line), err: (line: string) => stderr.push(line) };
}

describe("CLI integration with fake Copilot executable", () => {
  test("init is repeatable, role set converges, sync is idempotent, and unrelated plugins are untouched", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-home-");
    const fake = await createFakeCopilot({
      plugins: [
        { name: "personal-tool", marketplace: "other", version: "9.9.9", enabled: true, source: "user" },
        { name: "role-api", marketplace: "other", version: "8.8.8", enabled: true, source: "user" },
      ],
    });
    const first = capture();
    const base = { cwd: repo, homeDir: home, copilot: fake.client, out: first.out, err: first.err, env: { ...process.env, TEAM_AI_MARKETPLACE_SOURCE: "test-org/teamai-marketplace" } };

    expect(await runCli(["init", "--role", "api"], base)).toBe(0);
    expect(first.stderr).toEqual([]);
    const config = await readGlobalConfig(home);
    expect(config?.role).toBe("api");
    expect(config?.managedPlugins).toEqual([`common@${MARKETPLACE_NAME}`, `role-api@${MARKETPLACE_NAME}`]);

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
    expect(afterReinit.plugins.find((item) => item.name === "role-api" && item.marketplace === MARKETPLACE_NAME)?.enabled).toBe(false);
    expect(afterReinit.plugins.find((item) => item.name === "role-ios" && item.marketplace === MARKETPLACE_NAME)?.enabled).toBe(true);

    const switched = capture();
    expect(await runCli(["role", "set", "qa"], { ...base, out: switched.out, err: switched.err })).toBe(0);
    const afterSwitch = await fake.readState();
    expect(afterSwitch.plugins.find((item) => item.name === "role-api" && item.marketplace === MARKETPLACE_NAME)?.enabled).toBe(false);
    expect(afterSwitch.plugins.find((item) => item.name === "role-qa")?.enabled).toBe(true);
    expect(afterSwitch.plugins.find((item) => item.name === "personal-tool")?.enabled).toBe(true);
    expect(afterSwitch.plugins.find((item) => item.name === "role-api" && item.marketplace === "other")?.enabled).toBe(true);

    const synced = capture();
    expect(await runCli(["sync"], { ...base, out: synced.out, err: synced.err })).toBe(0);
    expect(synced.stdout).toContain("Copilot plugin state is already converged.");

    const syncedAgain = capture();
    expect(await runCli(["sync"], { ...base, out: syncedAgain.out, err: syncedAgain.err })).toBe(0);
    expect(syncedAgain.stdout).toContain("Copilot plugin state is already converged.");

    const status = capture();
    expect(await runCli(["status"], { ...base, out: status.out, err: status.err })).toBe(0);
    expect(status.stdout.some((line) => line.includes(`role-qa@${MARKETPLACE_NAME}: enabled`))).toBe(true);

    const doctor = capture();
    expect(await runCli(["doctor"], { ...base, out: doctor.out, err: doctor.err })).toBe(0);
    expect(doctor.stdout.some((line) => line.includes(`✓ role-qa@${MARKETPLACE_NAME} is enabled.`))).toBe(true);
  }, 30_000);

  test("dry-run previews init without changing Copilot, config, or project machine state", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-dry-home-");
    const fake = await createFakeCopilot();
    const before = await fake.readState();
    const output = capture();

    expect(await runCli(["--dry-run", "init", "--role", "api"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: output.out,
      err: output.err,
      env: { ...process.env, TEAM_AI_MARKETPLACE_SOURCE: "test-org/teamai-marketplace" },
    })).toBe(0);

    expect(await fake.readState()).toEqual(before);
    expect(await readGlobalConfig(home)).toBeUndefined();
    expect(output.stdout.some((line) => line.startsWith("WOULD marketplace-add"))).toBe(true);
    expect(output.stdout).toContain("WOULD write: project machine state");
  }, 10_000);

  test("does not claim or mutate a pre-existing user-owned Team AI role plugin", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-owned-home-");
    const fake = await createFakeCopilot({
      marketplaces: [{ name: MARKETPLACE_NAME, source: "user-added" }],
      plugins: [{ name: "role-api", marketplace: MARKETPLACE_NAME, version: "0.0.1", enabled: false, source: `marketplace:${MARKETPLACE_NAME}` }],
    });
    const output = capture();

    expect(await runCli(["init", "--role", "api"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: output.out,
      err: output.err,
      env: process.env,
    })).toBe(0);

    const state = await fake.readState();
    expect(state.plugins.find((item) => item.name === "role-api")).toMatchObject({ version: "0.0.1", enabled: false });
    const config = await readGlobalConfig(home);
    expect(config?.managedPlugins).toEqual([`common@${MARKETPLACE_NAME}`]);
    expect(output.stdout.some((line) => line.includes("not Team AI managed"))).toBe(true);
  }, 10_000);

  test("claims disabled live-marketplace projections by installing the desired plugins", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-live-marketplace-home-");
    const fake = await createFakeCopilot({
      marketplaces: [{ name: MARKETPLACE_NAME, source: "Local: test-marketplace" }],
      plugins: [
        { name: "common", marketplace: MARKETPLACE_NAME, version: "0.1.0", enabled: false, source: `live-marketplace:${MARKETPLACE_NAME}` },
        { name: "role-design", marketplace: MARKETPLACE_NAME, version: "0.1.0", enabled: false, source: `live-marketplace:${MARKETPLACE_NAME}` },
      ],
    });
    const output = capture();

    expect(await runCli(["init", "--role", "design"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: output.out,
      err: output.err,
      env: process.env,
    })).toBe(0);

    const state = await fake.readState();
    expect(state.plugins.find((item) => item.name === "common")?.enabled).toBe(true);
    expect(state.plugins.find((item) => item.name === "role-design")?.enabled).toBe(true);
    const config = await readGlobalConfig(home);
    expect(config?.managedPlugins).toEqual([`common@${MARKETPLACE_NAME}`, `role-design@${MARKETPLACE_NAME}`]);
    expect(output.stdout.filter((line) => line.includes("plugin-install")).length).toBe(2);
  }, 10_000);

  test("validates a product plugin against the marketplace before writing repository settings", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-product-home-");
    const fake = await createFakeCopilot({
      catalog: {
        [MARKETPLACE_NAME]: [
          { name: "common", version: "0.1.0" },
          { name: "role-api", version: "0.1.0" },
          { name: "product-payments", version: "0.1.0" },
        ],
      },
    });
    const output = capture();

    expect(await runCli(["init", "--role", "api", "--product", "payments"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: output.out,
      err: output.err,
      env: { ...process.env, TEAM_AI_MARKETPLACE_SOURCE: "test-org/teamai-marketplace" },
    })).toBe(0);

    const settings = JSON.parse(await readFile(path.join(repo, ".github", "copilot", "settings.json"), "utf8"));
    expect(settings.enabledPlugins[`product-payments@${MARKETPLACE_NAME}`]).toBe(true);
    expect(settings.extraKnownMarketplaces[MARKETPLACE_NAME]).toEqual({
      source: { source: "github", repo: "test-org/teamai-marketplace" },
    });
  }, 10_000);

  test("refuses to write an unknown product plugin", async () => {
    const repo = await createGitRepo();
    const home = await tempDir("team-ai-product-missing-home-");
    const fake = await createFakeCopilot();
    const output = capture();

    expect(await runCli(["init", "--role", "api", "--product", "missing"], {
      cwd: repo,
      homeDir: home,
      copilot: fake.client,
      out: output.out,
      err: output.err,
      env: { ...process.env, TEAM_AI_MARKETPLACE_SOURCE: "test-org/teamai-marketplace" },
    })).toBe(1);
    await expect(readFile(path.join(repo, ".github", "copilot", "settings.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(output.stderr.some((line) => line.includes("is not present in the marketplace"))).toBe(true);
  }, 10_000);
});
