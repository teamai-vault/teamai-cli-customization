import { readGlobalConfig, writeGlobalConfig } from "../config/global.js";
import { createConfig } from "../config/schema.js";
import { normalizeMarketplaceSource, resolveMarketplaceConfig } from "../copilot/marketplace.js";
import { convergeUserPlugins, enabledUserPlugins } from "../copilot/plugins.js";
import { enabledProductPlugins, mergeProductPlugin, productPluginName, readProjectSettings, writeProjectSettings } from "../copilot/project-settings.js";
import { detectProjectIdentity } from "../project/anchors.js";
import { partitionPath } from "../project/partition.js";
import { writeProjectState } from "../project/state.js";
import type { CommandContext } from "./context.js";
import { printActions, printWarnings } from "./helpers.js";

export interface InitOptions {
  marketplace?: string;
  role?: string;
  product?: string;
}

export async function initCommand(context: CommandContext, options: InitOptions): Promise<void> {
  let config = await readGlobalConfig(context.homeDir);
  let source = options.marketplace
    ? normalizeMarketplaceSource(options.marketplace, context.cwd)
    : config?.marketplace.source;
  if (!source) {
    if (!context.interactive) throw new Error(nonInteractiveRequirement("Marketplace URL"));
    source = normalizeMarketplaceSource(await context.promptMarketplace(), context.cwd);
  }
  if (config && source !== config.marketplace.source) {
    throw new Error([
      "A different Marketplace is already configured.",
      `Current: ${config.marketplace.name} (${config.marketplace.source})`,
      `Requested: ${source}`,
      "Refusing to switch Marketplace during init.",
    ].join("\n"));
  }

  const catalog = await context.loadMarketplace(source, context.cwd);
  try {
    context.out(`Marketplace discovered: ${catalog.name}`);
    let role = options.role ?? config?.role;
    if (!role) {
      if (!context.interactive) throw new Error(nonInteractiveRequirement("Role"));
      role = await context.promptRole(catalog.plugins.filter((plugin) => plugin.kind === "role").map((plugin) => plugin.name));
    }
    enabledUserPlugins(role, catalog.plugins, catalog.name);

    const version = await context.copilot.version();
    context.out(`Copilot CLI: ${version}`);
    let marketplaceAdded = false;
    if (!config) {
      const marketplace = await resolveMarketplaceConfig(context.copilot, source, catalog.name, {
        cwd: context.cwd,
        dryRun: context.dryRun,
      });
      config = createConfig(marketplace.config);
      marketplaceAdded = marketplace.added;
    } else if (config.marketplace.name !== catalog.name) {
      throw new Error(`Configured Marketplace name '${config.marketplace.name}' does not match source manifest '${catalog.name}'.`);
    }
    config.role = role;

    const identity = await detectProjectIdentity(context.cwd);
    if (options.product && !identity) throw new Error("--product requires running team-ai init inside a Git repository.");
    const productName = options.product ? productPluginName(options.product) : undefined;

    let converged;
    try {
      converged = await convergeUserPlugins(context.copilot, config, catalog.plugins, {
        dryRun: context.dryRun,
        cwd: context.cwd,
        requiredCatalogPlugin: productName,
      });
    } catch (error) {
      if (marketplaceAdded && !context.dryRun) {
        try {
          await context.copilot.removeMarketplace(config.marketplace.name, context.cwd);
        } catch (cleanupError) {
          throw new Error(`${(error as Error).message} Cleanup also failed: ${(cleanupError as Error).message}`);
        }
      }
      throw error;
    }
    printActions(converged.actions, context.dryRun, context.out);
    printWarnings(converged.warnings, context.out);
    config.managedPlugins = converged.managedPlugins;

    let productPlugins: string[] = [];
    if (identity) {
      let settings = await readProjectSettings(identity.workspaceRoot);
      if (options.product && productName) {
        const merged = mergeProductPlugin(settings, config.marketplace, options.product);
        if (JSON.stringify(merged) !== JSON.stringify(settings)) {
          context.out(`${context.dryRun ? "WOULD" : "DONE"} write: .github/copilot/settings.json`);
          if (!context.dryRun) await writeProjectSettings(identity.workspaceRoot, merged);
          settings = merged;
        }
      }
      productPlugins = enabledProductPlugins(settings, config.marketplace.name);
      context.out(`Project root: ${identity.workspaceRoot}`);
      context.out(`Project anchor: ${identity.projectAnchor}`);
      context.out(`Machine partition: ${partitionPath(identity.projectAnchor, context.homeDir)}`);
      if (!context.dryRun) {
        await writeProjectState(identity.projectAnchor, {
          schemaVersion: 1,
          workspaceRoot: identity.workspaceRoot,
          lastSync: context.now().toISOString(),
          managedPlugins: converged.managedPlugins,
          productPlugins,
        }, context.homeDir);
      } else {
        context.out("WOULD write: project machine state");
      }
    }

    if (!context.dryRun) await writeGlobalConfig(config, context.homeDir);
    else context.out("WOULD write: ~/.team-ai/config.yaml");

    if (identity) {
      context.out("Project-specific skills, agents, instructions, and hooks remain in this repository under .github/*.");
      context.out("If .github/copilot-instructions.md is missing, use the native `copilot init` command to generate it.");
    }
  } finally {
    await catalog.dispose();
  }
}

function nonInteractiveRequirement(missing: string): string {
  return `${missing} is required in non-interactive mode. Use: team-ai init --marketplace <source> --role <role>`;
}
