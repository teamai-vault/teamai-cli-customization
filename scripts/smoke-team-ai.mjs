#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marketplaceRoot = path.resolve(cliRoot, "..", "teamai-marketplace");
let runRoot;
let repository;
let env;

async function run(command, args, cwd = repository) {
  try {
    return await exec(command, args, { cwd, env, windowsHide: true });
  } catch (error) {
    throw new Error(`${command} ${args.join(" ")} failed: ${error.stderr?.trim() || error.stdout?.trim() || error.message}`);
  }
}

try {
  runRoot = await mkdtemp(path.join(os.tmpdir(), "team-ai-real-e2e-"));
  const profile = path.join(runRoot, "profile");
  repository = path.join(runRoot, "repository");
  const copilotHome = path.join(profile, ".copilot");
  const cacheHome = path.join(profile, ".cache");
  const appData = path.join(profile, "AppData", "Roaming");
  const localAppData = path.join(profile, "AppData", "Local");
  await Promise.all([repository, copilotHome, cacheHome, appData, localAppData].map((directory) => mkdir(directory, { recursive: true })));
  env = {
    ...process.env,
    HOME: profile,
    USERPROFILE: profile,
    COPILOT_HOME: copilotHome,
    COPILOT_CACHE_HOME: cacheHome,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    TEAM_AI_MARKETPLACE_SOURCE: marketplaceRoot,
  };
  delete env.COPILOT_GITHUB_TOKEN;
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;

  await run("git", ["init", "-b", "main"]);
  await run("git", ["config", "user.email", "team-ai@example.invalid"]);
  await run("git", ["config", "user.name", "Team AI Test"]);
  await writeFile(path.join(repository, "README.md"), "# test\n", "utf8");
  await run("git", ["add", "README.md"]);
  await run("git", ["commit", "-m", "initial"]);

  const cli = path.join(cliRoot, "dist", "cli.js");
  await run(process.execPath, [cli, "init", "--role", "api", "--product", "teamai"]);
  await run(process.execPath, [cli, "doctor"]);

  const settings = JSON.parse(await readFile(path.join(repository, ".github", "copilot", "settings.json"), "utf8"));
  assert.equal(settings.enabledPlugins["product-teamai@teamai"], true);
  assert.equal(settings.extraKnownMarketplaces.teamai.source.source, "directory");

  console.log(`Real team-ai Product Plugin E2E passed on ${process.platform}.`);
} finally {
  if (runRoot) await rm(runRoot, { recursive: true, force: true });
}
