import path from "node:path";
import { atomicWriteJson, readJsonIfExists } from "../utils/fs.js";
import type { MarketplaceConfig } from "../config/schema.js";

export interface MarketplaceSetting {
  source: Record<string, string>;
  autoUpdate?: boolean;
  [key: string]: unknown;
}

export interface ProjectSettings {
  extraKnownMarketplaces?: Record<string, MarketplaceSetting>;
  enabledPlugins?: Record<string, boolean>;
  [key: string]: unknown;
}

export function projectSettingsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".github", "copilot", "settings.json");
}

export async function readProjectSettings(workspaceRoot: string): Promise<ProjectSettings> {
  try {
    return (await readJsonIfExists<ProjectSettings>(projectSettingsPath(workspaceRoot))) ?? {};
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${projectSettingsPath(workspaceRoot)} contains invalid JSON.`);
    }
    throw error;
  }
}

export function marketplaceSourceSetting(source: string): MarketplaceSetting {
  if (/^[A-Za-z]:[\\/]/.test(source) || source.startsWith("/") || source.startsWith("./") || source.startsWith("../")) {
    return { source: { source: "directory", path: path.resolve(source) } };
  }
  if (/^(?:https?:\/\/|ssh:\/\/|git@)/.test(source)) {
    return { source: { source: "git", url: source } };
  }
  return { source: { source: "github", repo: source } };
}

export function mergeManagedProjectPlugins(
  current: ProjectSettings,
  marketplace: MarketplaceConfig,
  projectPlugins: string[],
  ownedPlugins: string[],
): ProjectSettings {
  const desired = new Set(projectPlugins.map((plugin) => `${plugin}@${marketplace.name}`));
  const owned = new Set(ownedPlugins);
  const enabledPlugins = { ...(current.enabledPlugins ?? {}) };
  for (const spec of owned) if (!desired.has(spec)) delete enabledPlugins[spec];
  for (const spec of desired) if (owned.has(spec) || !(spec in enabledPlugins)) enabledPlugins[spec] = true;
  const ownsNewPlugin = [...desired].some((spec) => owned.has(spec) || !(spec in (current.enabledPlugins ?? {})));
  if (!ownsNewPlugin && owned.size === 0) return current;
  return {
    ...current,
    ...(ownsNewPlugin ? { extraKnownMarketplaces: { ...(current.extraKnownMarketplaces ?? {}), [marketplace.name]: marketplaceSourceSetting(marketplace.source) } } : {}),
    enabledPlugins,
  };
}

export async function writeProjectSettings(workspaceRoot: string, settings: ProjectSettings): Promise<void> {
  await atomicWriteJson(projectSettingsPath(workspaceRoot), settings);
}
