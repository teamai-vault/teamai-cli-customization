import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { atomicWriteText, readTextIfExists } from "../utils/fs.js";
import { createDefaultConfig, type TeamAiConfig, validateConfig } from "./schema.js";

export function teamAiHome(homeDir = os.homedir()): string {
  return path.join(homeDir, ".team-ai");
}

export function configPath(homeDir = os.homedir()): string {
  return path.join(teamAiHome(homeDir), "config.yaml");
}

export async function readGlobalConfig(homeDir = os.homedir()): Promise<TeamAiConfig | undefined> {
  const contents = await readTextIfExists(configPath(homeDir));
  if (contents === undefined) return undefined;
  return validateConfig(parse(contents));
}

export async function loadGlobalConfig(homeDir = os.homedir(), marketplaceSource?: string): Promise<TeamAiConfig> {
  return (await readGlobalConfig(homeDir)) ?? createDefaultConfig(marketplaceSource);
}

export async function writeGlobalConfig(config: TeamAiConfig, homeDir = os.homedir()): Promise<void> {
  const ordered = {
    version: config.version,
    marketplace: config.marketplace,
    ...(config.role ? { role: config.role } : {}),
    managedPlugins: config.managedPlugins ?? [],
  };
  await atomicWriteText(configPath(homeDir), stringify(ordered));
}
