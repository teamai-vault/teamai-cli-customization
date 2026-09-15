import { cp, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { loadMarketplaceCatalog, type MarketplaceCatalog } from "./catalog.js";
import type { CopilotOperations, InstalledPlugin, MarketplacePluginRow, MarketplaceRow, NativeMcpServer } from "./cli.js";
import {
  installedPluginsRoot,
  readCopilotState,
  registerMarketplaceState,
  removeMarketplaceState,
  setPluginEnabled,
  updateCopilotState,
  upsertInstalledPlugin,
} from "./user-state.js";

export class FallbackCopilotClient implements CopilotOperations {
  constructor(
    private readonly homeDir: string,
    private readonly now: () => Date,
    private readonly loadMarketplace = loadMarketplaceCatalog,
  ) {}

  async version(): Promise<string> {
    return "VS Code-compatible fallback";
  }

  async listPlugins(): Promise<InstalledPlugin[]> {
    const { config, settings } = await readCopilotState(this.homeDir);
    return (config.installedPlugins ?? []).map((plugin) => ({
      ...plugin,
      enabled: settings.enabledPlugins?.[`${plugin.name}@${plugin.marketplace}`] ?? plugin.enabled ?? false,
    }));
  }

  async listMcpServers(): Promise<{ servers: NativeMcpServer[]; errors: string[] }> {
    const servers: NativeMcpServer[] = [];
    const errors: string[] = [];
    for (const plugin of await this.listPlugins()) {
      if (!plugin.enabled || typeof plugin.cache_path !== "string") continue;
      try {
        const config = JSON.parse(await readFile(path.join(plugin.cache_path, "mcp.json"), "utf8")) as { mcpServers?: Record<string, unknown> };
        for (const name of Object.keys(config.mcpServers ?? {})) servers.push({ name, source: `plugin:${plugin.name}` });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") errors.push(`${plugin.name}: invalid mcp.json`);
      }
    }
    return { servers, errors };
  }

  async listMarketplaces(): Promise<MarketplaceRow[]> {
    const { settings } = await readCopilotState(this.homeDir);
    return Object.entries(settings.extraKnownMarketplaces ?? {}).map(([name, value]) => ({
      name,
      source: sourceValue(value.source),
    }));
  }

  async browseMarketplace(name: string, cwd?: string): Promise<MarketplacePluginRow[]> {
    const catalog = await this.catalog(name, cwd);
    try {
      return catalog.plugins.map((plugin) => ({ name: plugin.name, version: plugin.version }));
    } finally {
      await catalog.dispose();
    }
  }

  async addMarketplace(source: string, cwd = process.cwd()): Promise<void> {
    const catalog = await this.loadMarketplace(source, cwd);
    try {
      await updateCopilotState(this.homeDir, (_config, settings) => registerMarketplaceState(settings, catalog.name, source));
    } finally {
      await catalog.dispose();
    }
  }

  async removeMarketplace(name: string): Promise<void> {
    await updateCopilotState(this.homeDir, (_config, settings) => removeMarketplaceState(settings, name));
  }

  async installPlugin(spec: string, cwd?: string): Promise<void> {
    const [name, marketplace] = splitSpec(spec);
    const catalog = await this.catalog(marketplace, cwd);
    try {
      const plugin = catalog.plugins.find((item) => item.name === name);
      if (!plugin) throw new Error(`${spec} is not present in the Marketplace.`);
      const target = path.join(installedPluginsRoot(this.homeDir), marketplace, name);
      await replaceDirectory(plugin.root, target);
      await updateCopilotState(this.homeDir, (config, settings) => upsertInstalledPlugin(config, settings, {
        name,
        marketplace,
        version: plugin.version,
        cache_path: target,
        enabled: true,
      }, this.now().toISOString()));
    } finally {
      await catalog.dispose();
    }
  }

  async enablePlugin(spec: string): Promise<void> {
    await this.setEnabled(spec, true);
  }

  async disablePlugin(spec: string): Promise<void> {
    await this.setEnabled(spec, false);
  }

  async updatePlugin(spec: string, cwd?: string): Promise<void> {
    const current = (await this.listPlugins()).find((plugin) => `${plugin.name}@${plugin.marketplace}` === spec);
    if (!current) throw new Error(`${spec} is not installed.`);
    await this.installPlugin(spec, cwd);
    if (!current.enabled) await this.disablePlugin(spec);
  }

  private async setEnabled(spec: string, enabled: boolean): Promise<void> {
    const [name, marketplace] = splitSpec(spec);
    await updateCopilotState(this.homeDir, (config, settings) => setPluginEnabled(config, settings, name, marketplace, enabled));
  }

  private async catalog(name: string, cwd = process.cwd()): Promise<MarketplaceCatalog> {
    const { settings } = await readCopilotState(this.homeDir);
    const source = settings.extraKnownMarketplaces?.[name]?.source;
    if (!source) throw new Error(`Marketplace ${name} is not registered.`);
    return await this.loadMarketplace(sourceValue(source), cwd);
  }
}

function splitSpec(spec: string): [string, string] {
  const at = spec.lastIndexOf("@");
  if (at <= 0 || at === spec.length - 1) throw new Error(`Plugin spec must be <name>@<marketplace>: ${spec}`);
  return [spec.slice(0, at), spec.slice(at + 1)];
}

function sourceValue(source: Record<string, string>): string {
  return source.path ?? source.url ?? source.repo ?? "";
}

async function replaceDirectory(source: string, target: string): Promise<void> {
  const parent = path.dirname(target);
  const suffix = `${process.pid}.${Date.now()}`;
  const temporary = path.join(parent, `.${path.basename(target)}.${suffix}.tmp`);
  const backup = path.join(parent, `.${path.basename(target)}.${suffix}.bak`);
  await mkdir(parent, { recursive: true });
  await cp(source, temporary, { recursive: true, errorOnExist: true });
  let hadTarget = false;
  try {
    await rename(target, backup);
    hadTarget = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await rename(temporary, target);
    if (hadTarget) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (hadTarget) await rename(backup, target);
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}
