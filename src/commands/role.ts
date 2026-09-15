import { readGlobalConfig, writeGlobalConfig } from "../config/global.js";
import type { CatalogPlugin } from "../copilot/catalog.js";
import { convergeUserPlugins, enabledUserPlugins } from "../copilot/plugins.js";
import type { CommandContext } from "./context.js";
import { printActions, printWarnings } from "./helpers.js";

export async function roleListCommand(context: CommandContext): Promise<void> {
  const current = await readGlobalConfig(context.homeDir);
  if (!current) throw new Error("Team AI is not initialized. Run `team-ai init` first.");
  const { catalog, dispose } = await roleCatalog(context, current.marketplace.source, current.marketplace.name, current.managedPlugins ?? []);
  try {
    for (const plugin of catalog.filter((item) => item.kind === "role")) context.out(plugin.name);
  } finally {
    await dispose();
  }
}

export async function roleSetCommand(context: CommandContext, role: string): Promise<void> {
  const current = await readGlobalConfig(context.homeDir);
  if (!current) throw new Error("Team AI is not initialized. Run `team-ai init` first.");

  const { catalog, dispose } = await roleCatalog(context, current.marketplace.source, current.marketplace.name, current.managedPlugins ?? []);
  enabledUserPlugins(role, catalog, current.marketplace.name);
  const next = { ...current, role };
  try {
    const converged = await convergeUserPlugins(context.copilot, next, catalog, {
      dryRun: context.dryRun,
      cwd: context.cwd,
    });
    printActions(converged.actions, context.dryRun, context.out);
    printWarnings(converged.warnings, context.out);
    next.managedPlugins = converged.managedPlugins;
    if (!context.dryRun) await writeGlobalConfig(next, context.homeDir);
    else context.out("WOULD write: ~/.team-ai/config.yaml");
    context.out(`Role: ${role}`);
  } finally {
    await dispose();
  }
}

async function roleCatalog(
  context: CommandContext,
  source: string,
  marketplaceName: string,
  managedPlugins: string[],
): Promise<{ catalog: CatalogPlugin[]; dispose: () => Promise<void> }> {
  try {
    const loaded = await context.loadMarketplace(source, context.cwd);
    if (loaded.name !== marketplaceName) throw new Error(`Marketplace name changed from '${marketplaceName}' to '${loaded.name}'.`);
    return { catalog: loaded.plugins, dispose: loaded.dispose };
  } catch (error) {
    const suffix = `@${marketplaceName}`;
    const names = managedPlugins.filter((spec) => spec.endsWith(suffix)).map((spec) => spec.slice(0, -suffix.length));
    if (!names.includes("common") || names.length < 2) throw error;
    return {
      catalog: names.map((name) => ({ name, version: "", kind: name === "common" ? "common" : "role", root: "" })),
      dispose: async () => undefined,
    };
  }
}
