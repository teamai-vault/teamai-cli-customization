import { readGlobalConfig, writeGlobalConfig } from "../config/global.js";
import { convergeUserPlugins } from "../copilot/plugins.js";
import { enabledProductPlugins, readProjectSettings } from "../copilot/project-settings.js";
import { convergeMarketplaceUserInstructions } from "../copilot/user-instructions.js";
import { registerVsCodeMarketplace } from "../copilot/vscode-settings.js";
import { detectProjectIdentity } from "../project/anchors.js";
import { writeProjectState } from "../project/state.js";
import type { CommandContext } from "./context.js";
import { printActions, printUserInstructionActions, printWarnings } from "./helpers.js";

export async function syncCommand(context: CommandContext): Promise<void> {
  const config = await readGlobalConfig(context.homeDir);
  if (!config?.role) throw new Error("Team AI is not initialized. Run `team-ai init` first.");

  const catalog = await context.loadMarketplace(config.marketplace.source, context.cwd);
  if (catalog.name !== config.marketplace.name) {
    await catalog.dispose();
    throw new Error(`Configured Marketplace name '${config.marketplace.name}' does not match source manifest '${catalog.name}'.`);
  }
  let converged;
  let userInstructions;
  try {
    userInstructions = await convergeMarketplaceUserInstructions(catalog.root, context.homeDir, { dryRun: context.dryRun });
    if (context.copilotMode === "unavailable") {
      printUserInstructionActions(userInstructions, context.dryRun, context.out);
      throw new Error("Copilot CLI and VS Code backends are unavailable; Marketplace user instructions were synchronized, but plugin convergence could not run.");
    }
    converged = await convergeUserPlugins(context.copilot, config, catalog.plugins, { dryRun: context.dryRun, cwd: context.cwd });
  } finally {
    await catalog.dispose();
  }
  printActions(converged.actions, context.dryRun, context.out);
  printWarnings(converged.warnings, context.out);
  printUserInstructionActions(userInstructions, context.dryRun, context.out);
  if (await registerVsCodeMarketplace(context.vscodeSettingsPath, config.marketplace.source, context.dryRun)) {
    context.out(`${context.dryRun ? "WOULD" : "DONE"} write: VS Code User Settings chat.plugins.marketplaces`);
  }
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
