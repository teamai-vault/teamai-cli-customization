#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marketplaceRoot = path.resolve(cliRoot, "..", "teamai-marketplace");
let runRoot;

async function run(command, args, options) {
  try {
    return await exec(command, args, { windowsHide: true, ...options });
  } catch (error) {
    throw new Error(`${command} ${args.join(" ")} failed: ${error.stderr?.trim() || error.stdout?.trim() || error.message}`);
  }
}

async function runCopilot(args, options) {
  return process.platform === "win32"
    ? await run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "copilot", ...args], options)
    : await run("copilot", args, options);
}

try {
  runRoot = await mkdtemp(path.join(os.tmpdir(), "team-ai-fallback-e2e-"));
  const profile = path.join(runRoot, "profile");
  const repository = path.join(runRoot, "repository");
  const fakeBin = path.join(runRoot, "bin");
  const appData = path.join(profile, "AppData", "Roaming");
  await Promise.all([repository, fakeBin, appData].map((directory) => mkdir(directory, { recursive: true })));

  const codePath = path.join(fakeBin, process.platform === "win32" ? "code.cmd" : "code");
  await writeFile(codePath, process.platform === "win32" ? "@echo fake-code\r\n" : "#!/bin/sh\necho fake-code\n", "utf8");
  if (process.platform !== "win32") await chmod(codePath, 0o755);
  const gitPath = (await run(process.platform === "win32" ? "where.exe" : "which", ["git"])).stdout.trim().split(/\r?\n/, 1)[0];
  const fallbackEnv = {
    ...process.env,
    HOME: profile,
    USERPROFILE: profile,
    APPDATA: appData,
    PATH: `${fakeBin}${path.delimiter}${path.dirname(gitPath)}`,
  };
  delete fallbackEnv.COPILOT_HOME;

  await run("git", ["init", "-b", "main"], { cwd: repository, env: { ...fallbackEnv, PATH: process.env.PATH } });
  await run("git", ["config", "user.email", "team-ai@example.invalid"], { cwd: repository, env: { ...fallbackEnv, PATH: process.env.PATH } });
  await run("git", ["config", "user.name", "Team AI Test"], { cwd: repository, env: { ...fallbackEnv, PATH: process.env.PATH } });
  await writeFile(path.join(repository, "README.md"), "# test\n", "utf8");
  await run("git", ["add", "README.md"], { cwd: repository, env: { ...fallbackEnv, PATH: process.env.PATH } });
  await run("git", ["commit", "-m", "initial"], { cwd: repository, env: { ...fallbackEnv, PATH: process.env.PATH } });

  const cli = path.join(cliRoot, "dist", "cli.js");
  await run(process.execPath, [cli, "init", "--marketplace", marketplaceRoot, "--role", "api"], { cwd: repository, env: fallbackEnv });
  await run(process.execPath, [cli, "role", "set", "qa"], { cwd: repository, env: fallbackEnv });
  await run(process.execPath, [cli, "sync"], { cwd: repository, env: fallbackEnv });
  await run(process.execPath, [cli, "doctor"], { cwd: repository, env: fallbackEnv });

  const configPath = path.join(profile, ".copilot", "config.json");
  const settingsPath = path.join(profile, ".copilot", "settings.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const settings = JSON.parse(await readFile(settingsPath, "utf8"));
  assert.equal(config.installedPlugins.length, 6);
  assert.ok(config.installedPlugins.every((plugin) => plugin.source_sha === undefined));
  assert.equal(settings.enabledPlugins["common@teamai"], true);
  assert.equal(settings.enabledPlugins["qa@teamai"], true);
  for (const name of ["api", "ios", "aos", "design"]) assert.equal(settings.enabledPlugins[`${name}@teamai`], false);

  const nativeEnv = { ...process.env, HOME: profile, USERPROFILE: profile, APPDATA: appData };
  delete nativeEnv.COPILOT_HOME;
  const nativePlugins = JSON.parse((await runCopilot(["plugins", "list", "--kind", "plugin", "--json"], { cwd: repository, env: nativeEnv })).stdout).plugins;
  for (const name of ["common", "api", "ios", "aos", "qa", "design"]) {
    assert.ok(nativePlugins.some((plugin) => plugin.name === name), `native Copilot should recognize ${name}@teamai`);
  }

  console.log(`Fallback materialization and native Copilot recognition passed on ${process.platform}.`);
} finally {
  if (runRoot) await rm(runRoot, { recursive: true, force: true });
}
