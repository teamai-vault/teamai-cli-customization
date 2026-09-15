import { readGlobalConfig } from "../config/global.js";
import { desiredUserPlugins, pluginSpec } from "../copilot/plugins.js";
import { enabledProductPlugins, readProjectSettings } from "../copilot/project-settings.js";
import { detectProjectIdentity } from "../project/anchors.js";
import { partitionPath } from "../project/partition.js";
import { readProjectState } from "../project/state.js";
import type { CommandContext } from "./context.js";
import { projectCustomizationCounts } from "./helpers.js";

export async function statusCommand(context: CommandContext): Promise<void> {
  const config = await readGlobalConfig(context.homeDir);
  context.out("Team AI");
  context.out("");
  context.out("Global");
  if (!config) {
    context.out("  Config: not initialized");
  } else {
    context.out(`  Marketplace: ${config.marketplace.name} (${config.marketplace.source})`);
    context.out(`  Role: ${config.role ?? "not set"}`);
    try {
      const marketplaces = await context.copilot.listMarketplaces(context.cwd);
      context.out(`  Marketplace registered: ${marketplaces.some((item) => item.name === config.marketplace.name) ? "yes" : "no"}`);
      if (config.role) {
        const plugins = await context.copilot.listPlugins(context.cwd);
        for (const desired of desiredUserPlugins(config.role, config.marketplace.name)) {
          const row = plugins.find((item) => pluginSpec(item) === desired);
          context.out(`  ${desired}: ${row ? (row.enabled ? "enabled" : "disabled") : "missing"}`);
        }
      }
    } catch (error) {
      context.out(`  Copilot: unavailable (${(error as Error).message})`);
    }
  }

  context.out("");
  context.out("Copilot-native capabilities");
  try {
    const mcp = await context.copilot.listMcpServers(context.cwd);
    context.out(`  Native MCP servers: ${mcp.servers.length > 0 ? mcp.servers.map((server) => server.name).join(", ") : "none"}`);
    for (const error of mcp.errors) context.out(`  MCP inspection error: ${error}`);
  } catch (error) {
    context.out(`  Native MCP servers: unavailable (${(error as Error).message})`);
  }
  context.out("  Native Plugin Hooks: declaration validation only; runtime inspection unavailable");

  const identity = await detectProjectIdentity(context.cwd);
  context.out("");
  context.out("Project");
  if (!identity) {
    context.out("  Git project: none");
    return;
  }
  context.out(`  Root: ${identity.workspaceRoot}`);
  context.out(`  Anchor: ${identity.projectAnchor}`);
  if (config) {
    const settings = await readProjectSettings(identity.workspaceRoot);
    const products = enabledProductPlugins(settings, config.marketplace.name);
    context.out(`  Product plugins: ${products.length > 0 ? products.join(", ") : "none"}`);
  }
  const counts = await projectCustomizationCounts(identity.workspaceRoot);
  context.out(`  Native skills: ${counts.skills}`);
  context.out(`  Native agents: ${counts.agents}`);
  context.out(`  Native hooks: ${counts.hooks}`);
  context.out(`  Native instructions: ${counts.instructions}`);
  context.out(`  copilot-instructions.md: ${counts.rootInstructions ? "present" : "missing"}`);
  const state = await readProjectState(identity.projectAnchor, context.homeDir);
  context.out("");
  context.out("Machine state");
  context.out(`  Partition: ${partitionPath(identity.projectAnchor, context.homeDir)}`);
  context.out(`  Last sync: ${state?.lastSync ?? "never"}`);
}
