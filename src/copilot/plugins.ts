import type { Role, TeamAiConfig } from "../config/schema.js";
import type { CopilotClient, InstalledPlugin } from "./cli.js";

export interface PlannedAction {
  kind: "marketplace-add" | "plugin-install" | "plugin-enable" | "plugin-update" | "plugin-disable";
  target: string;
}

export interface ConvergeResult {
  actions: PlannedAction[];
  managedPlugins: string[];
  warnings: string[];
}

export function desiredUserPlugins(role: Role, marketplaceName: string): string[] {
  return [`common@${marketplaceName}`, `role-${role}@${marketplaceName}`];
}

export function pluginSpec(plugin: Pick<InstalledPlugin, "name" | "marketplace">): string {
  return plugin.marketplace ? `${plugin.name}@${plugin.marketplace}` : plugin.name;
}

export async function convergeUserPlugins(
  client: CopilotClient,
  config: TeamAiConfig,
  options: { dryRun?: boolean; cwd?: string; disableSpecs?: string[] } = {},
): Promise<ConvergeResult> {
  if (!config.role) throw new Error("No Team AI role is configured. Run `team-ai init --marketplace <source> --role <role>` first.");

  const actions: PlannedAction[] = [];
  const warnings: string[] = [];
  const desired = desiredUserPlugins(config.role, config.marketplace.name);
  const owned = new Set(config.managedPlugins ?? []);
  const marketplaces = await client.listMarketplaces(options.cwd);
  if (!marketplaces.some((item) => item.name === config.marketplace.name)) {
    actions.push({ kind: "marketplace-add", target: config.marketplace.source });
    if (!options.dryRun) await client.addMarketplace(config.marketplace.source, options.cwd);
  }

  let installed = await client.listPlugins(options.cwd);
  const catalog = marketplaces.some((item) => item.name === config.marketplace.name) || !options.dryRun
    ? await client.browseMarketplace(config.marketplace.name, options.cwd)
    : [];
  const catalogVersion = new Map(catalog.map((item) => [item.name, item.version]));

  for (const spec of desired) {
    const [name, marketplace] = spec.split("@");
    const current = installed.find((item) => item.name === name && item.marketplace === marketplace);
    if (!current) {
      actions.push({ kind: "plugin-install", target: spec });
      owned.add(spec);
      if (!options.dryRun) {
        await client.installPlugin(spec, options.cwd);
        installed = await client.listPlugins(options.cwd);
      }
      continue;
    }
    if (!owned.has(spec) && current.enabled === false && current.source === `live-marketplace:${marketplace}`) {
      actions.push({ kind: "plugin-install", target: spec });
      owned.add(spec);
      if (!options.dryRun) {
        await client.installPlugin(spec, options.cwd);
        installed = await client.listPlugins(options.cwd);
      }
      continue;
    }
    if (!owned.has(spec)) {
      const latest = catalogVersion.get(name);
      if (!current.enabled || (latest && current.version && latest !== current.version)) {
        warnings.push(`${spec} already exists but is not Team AI managed; preserving the user's enabled/version state.`);
      }
      continue;
    }
    if (!current.enabled) {
      actions.push({ kind: "plugin-enable", target: spec });
      if (!options.dryRun) await client.enablePlugin(spec, options.cwd);
    }
    const latest = catalogVersion.get(name);
    if (latest && current.version && latest !== current.version) {
      actions.push({ kind: "plugin-update", target: spec });
      if (!options.dryRun) await client.updatePlugin(spec, options.cwd);
    }
  }

  for (const spec of options.disableSpecs ?? []) {
    if (!owned.has(spec) || desired.includes(spec)) continue;
    const [name, marketplace] = spec.split("@");
    const current = installed.find((item) => item.name === name && item.marketplace === marketplace);
    if (current?.enabled) {
      actions.push({ kind: "plugin-disable", target: spec });
      if (!options.dryRun) await client.disablePlugin(spec, options.cwd);
    }
    owned.delete(spec);
  }

  return { actions, managedPlugins: [...owned].sort(), warnings };
}
