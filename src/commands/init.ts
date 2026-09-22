import { readGlobalConfig, writeGlobalConfig } from "../config/global.js";
import { createConfig } from "../config/schema.js";
import { normalizeMarketplaceSource, resolveMarketplaceConfig } from "../copilot/marketplace.js";
import { convergeUserPlugins, enabledUserPlugins } from "../copilot/plugins.js";
import { convergeMarketplaceUserInstructions } from "../copilot/user-instructions.js";
import { registerVsCodeMarketplace } from "../copilot/vscode-settings.js";
import { detectProjectIdentity } from "../project/anchors.js";
import { convergeLogicalProjectContext, projectionFor, withProjection } from "../project/context.js";
import { parseLogicalProjectIds } from "../project/manifest.js";
import { partitionPath } from "../project/partition.js";
import { readProjectState, writeProjectState } from "../project/state.js";
import type { CommandContext } from "./context.js";
import { printActions, printUserInstructionActions, printWarnings } from "./helpers.js";

export interface InitOptions {
  marketplace?: string;
  role?: string;
  projects?: string[];
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

  const catalog = await context.loadMarketplace(source, context.cwd, { refresh: true });
  try {
    context.out(`Marketplace discovered: ${catalog.name}`);
    let role = options.role ?? config?.role;
    if (!role) {
      if (!context.interactive) throw new Error(nonInteractiveRequirement("Role"));
      role = await context.promptRole(catalog.plugins.filter((plugin) => plugin.kind === "role").map((plugin) => plugin.name));
    }
    enabledUserPlugins(role, catalog.plugins, catalog.name);

    const userInstructions = await convergeMarketplaceUserInstructions(catalog.root, context.homeDir, { dryRun: context.dryRun });
    if (context.copilotMode === "unavailable") {
      printUserInstructionActions(userInstructions, context.dryRun, context.out);
      throw new Error("Copilot CLI and VS Code backends are unavailable; Marketplace user instructions were synchronized, but plugin convergence could not run.");
    }

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
    if (catalog.revision) config.marketplaceRevision = catalog.revision;
    else delete config.marketplaceRevision;

    const identity = await detectProjectIdentity(context.cwd);
    if (options.projects?.length && !identity) throw new Error("--project requires running team-ai init inside a Git repository.");
    const priorState = identity ? await readProjectState(identity.projectAnchor, context.homeDir) : undefined;
    const logicalProjects = options.projects ? parseLogicalProjectIds(options.projects) : projectionFor(priorState, identity?.workspaceRoot ?? "")?.logicalProjects ?? [];

    let converged;
    try {
      converged = await convergeUserPlugins(context.copilot, config, catalog.plugins, {
        dryRun: context.dryRun,
        cwd: context.cwd,
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
    printUserInstructionActions(userInstructions, context.dryRun, context.out);
    config.managedPlugins = converged.managedPlugins;
    if (await registerVsCodeMarketplace(context.vscodeSettingsPath, source, context.dryRun)) {
      context.out(`${context.dryRun ? "WOULD" : "DONE"} write: VS Code User Settings chat.plugins.marketplaces`);
    }

    if (identity) {
      const baseState = { ...(priorState ?? { schemaVersion: 1 as const, workspaceRoot: identity.workspaceRoot, managedPlugins: [] }), lastSync: context.now().toISOString(), managedPlugins: converged.managedPlugins };
      const projectContext = await convergeLogicalProjectContext({ marketplaceRoot: catalog.root, plugins: catalog.plugins, marketplace: config.marketplace, identity, state: priorState, logicalProjects, dryRun: context.dryRun });
      for (const change of projectContext.changes) context.out(`${context.dryRun ? "WOULD" : "DONE"} write: ${change}`);
      for (const warning of projectContext.warnings) context.out(`! ${warning}`);
      context.out(`Project root: ${identity.workspaceRoot}`);
      context.out(`Project anchor: ${identity.projectAnchor}`);
      context.out(`Machine partition: ${partitionPath(identity.projectAnchor, context.homeDir)}`);
      if (!context.dryRun) {
        await writeProjectState(identity.projectAnchor, withProjection(baseState, projectContext.projection), context.homeDir);
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
