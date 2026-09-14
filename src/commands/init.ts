import { loadGlobalConfig, writeGlobalConfig } from "../config/global.js";
import { isRole, ROLES, type Role } from "../config/schema.js";
import { convergeUserPlugins } from "../copilot/plugins.js";
import { enabledProductPlugins, mergeProductPlugin, productPluginName, readProjectSettings, writeProjectSettings } from "../copilot/project-settings.js";
import { detectProjectIdentity } from "../project/anchors.js";
import { partitionPath } from "../project/partition.js";
import { writeProjectState } from "../project/state.js";
import type { CommandContext } from "./context.js";
import { printActions, printWarnings } from "./helpers.js";

export interface InitOptions {
  role?: string;
  product?: string;
}

export async function initCommand(context: CommandContext, options: InitOptions): Promise<void> {
  const source = context.env.TEAM_AI_MARKETPLACE_SOURCE;
  const config = await loadGlobalConfig(context.homeDir, source);
  const previousRole = config.role;
  if (options.role !== undefined) {
    if (!isRole(options.role)) throw new Error(`Unknown role '${options.role}'. Expected one of: ${ROLES.join(", ")}.`);
    config.role = options.role as Role;
  }
  if (!config.role) throw new Error("A role is required for first-time init. Use `team-ai init --role <role>`. ");

  const identity = await detectProjectIdentity(context.cwd);
  if (options.product && !identity) {
    throw new Error("--product requires running team-ai init inside a Git repository.");
  }
  const productName = options.product ? productPluginName(options.product) : undefined;

  const version = await context.copilot.version();
  context.out(`Copilot CLI: ${version}`);
  const previousRoleSpec = previousRole && previousRole !== config.role
    ? `role-${previousRole}@${config.marketplace.name}`
    : undefined;
  const converged = await convergeUserPlugins(context.copilot, config, {
    dryRun: context.dryRun,
    cwd: context.cwd,
    disableSpecs: previousRoleSpec ? [previousRoleSpec] : [],
    requiredCatalogPlugin: productName,
  });
  printActions(converged.actions, context.dryRun, context.out);
  printWarnings(converged.warnings, context.out);
  config.managedPlugins = converged.managedPlugins;

  let productPlugins: string[] = [];
  if (identity) {
    let settings = await readProjectSettings(identity.workspaceRoot);
    if (options.product && productName) {
      if (converged.catalogAvailable) {
        const merged = mergeProductPlugin(settings, config.marketplace, options.product);
        if (JSON.stringify(merged) !== JSON.stringify(settings)) {
          context.out(`${context.dryRun ? "WOULD" : "DONE"} write: .github/copilot/settings.json`);
          if (!context.dryRun) await writeProjectSettings(identity.workspaceRoot, merged);
          settings = merged;
        }
      } else {
        context.out(`! Product validation skipped in dry-run because ${config.marketplace.name} is not currently browseable; project settings preview was not changed.`);
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

  if (!context.dryRun) {
    await writeGlobalConfig(config, context.homeDir);
  } else {
    context.out("WOULD write: ~/.team-ai/config.yaml");
  }

  if (identity) {
    context.out("Project-specific skills, agents, instructions, and hooks remain in this repository under .github/*.");
    context.out("If .github/copilot-instructions.md is missing, use the native `copilot init` command to generate it.");
  }
}
