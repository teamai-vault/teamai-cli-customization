import { readGlobalConfig, writeGlobalConfig } from "../config/global.js";
import { convergeUserPlugins } from "../copilot/plugins.js";
import { enabledProductPlugins, readProjectSettings } from "../copilot/project-settings.js";
import { detectProjectIdentity } from "../project/anchors.js";
import { writeProjectState } from "../project/state.js";
import type { CommandContext } from "./context.js";
import { printActions, printWarnings } from "./helpers.js";

export async function syncCommand(context: CommandContext): Promise<void> {
  const config = await readGlobalConfig(context.homeDir);
  if (!config?.role) throw new Error("Team AI is not initialized. Run `team-ai init --marketplace <source> --role <role>` first.");

  const converged = await convergeUserPlugins(context.copilot, config, { dryRun: context.dryRun, cwd: context.cwd });
  printActions(converged.actions, context.dryRun, context.out);
  printWarnings(converged.warnings, context.out);
  const managedChanged = JSON.stringify(config.managedPlugins ?? []) !== JSON.stringify(converged.managedPlugins);
  config.managedPlugins = converged.managedPlugins;
  if (managedChanged && !context.dryRun) await writeGlobalConfig(config, context.homeDir);
  if (managedChanged && context.dryRun) context.out("WOULD write: ~/.team-ai/config.yaml");

  const identity = await detectProjectIdentity(context.cwd);
  if (!identity) return;
  const settings = await readProjectSettings(identity.workspaceRoot);
  const products = enabledProductPlugins(settings, config.marketplace.name);
  context.out(`Repository product plugins: ${products.length > 0 ? products.join(", ") : "none"}`);
  if (!context.dryRun) {
    await writeProjectState(identity.projectAnchor, {
      schemaVersion: 1,
      workspaceRoot: identity.workspaceRoot,
      lastSync: context.now().toISOString(),
      managedPlugins: converged.managedPlugins,
      productPlugins: products,
    }, context.homeDir);
  } else {
    context.out("WOULD write: project machine state");
  }
}
