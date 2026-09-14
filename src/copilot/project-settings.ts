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

export function mergeProductPlugin(
  current: ProjectSettings,
  marketplace: MarketplaceConfig,
  product: string,
): ProjectSettings {
  const normalized = productPluginName(product);
  const spec = `${normalized}@${marketplace.name}`;
  return {
    ...current,
    extraKnownMarketplaces: {
      ...(current.extraKnownMarketplaces ?? {}),
      [marketplace.name]: marketplaceSourceSetting(marketplace.source),
    },
    enabledPlugins: {
      ...(current.enabledPlugins ?? {}),
      [spec]: true,
    },
  };
}

export function productPluginName(product: string): string {
  return product.startsWith("product-") ? product : `product-${product}`;
}

export function enabledProductPlugins(settings: ProjectSettings, marketplaceName: string): string[] {
  return Object.entries(settings.enabledPlugins ?? {})
    .filter(([spec, enabled]) => enabled && spec.startsWith("product-") && spec.endsWith(`@${marketplaceName}`))
    .map(([spec]) => spec)
    .sort();
}

export async function writeProjectSettings(workspaceRoot: string, settings: ProjectSettings): Promise<void> {
  await atomicWriteJson(projectSettingsPath(workspaceRoot), settings);
}
