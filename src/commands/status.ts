import { readGlobalConfig } from "../config/global.js";
import path from "node:path";
import { pluginSpec } from "../copilot/plugins.js";
import { checkUserInstructionState, discoverMarketplaceUserInstructions, userInstructionTargetRoot } from "../copilot/user-instructions.js";
import { detectProjectIdentity } from "../project/anchors.js";
import { projectionFor } from "../project/context.js";
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
    context.out("  User instructions: not initialized");
  } else {
    context.out(`  Marketplace: ${config.marketplace.name} (${config.marketplace.source})`);
    context.out(`  Marketplace revision: ${config.marketplaceRevision ?? "unknown"}`);
    context.out(`  Role: ${config.role ?? "not set"}`);
    context.out(`  Managed personal skills: ${config.managedSkills?.join(", ") || "none"}`);
    try {
      const marketplaces = await context.copilot.listMarketplaces(context.cwd);
      context.out(`  Marketplace registered: ${marketplaces.some((item) => item.name === config.marketplace.name) ? "yes" : "no"}`);
      if (config.managedPlugins?.length) {
        const plugins = await context.copilot.listPlugins(context.cwd);
        for (const desired of config.managedPlugins) {
          const row = plugins.find((item) => pluginSpec(item) === desired);
          context.out(`  ${desired}: ${row ? (row.enabled ? "enabled" : "disabled") : "missing"}`);
        }
      }
    } catch (error) {
      context.out(`  Copilot: unavailable (${(error as Error).message})`);
    }
    try {
      const catalog = await context.loadMarketplace(config.marketplace.source, context.cwd);
      try {
        if (catalog.revision && catalog.revision !== config.marketplaceRevision) context.out(`  Marketplace cache revision: ${catalog.revision}`);
        try {
          const desired = await discoverMarketplaceUserInstructions(catalog.root);
          const state = await checkUserInstructionState(desired, userInstructionTargetRoot(context.homeDir));
          context.out(`  User instructions: ${state.current ? `${state.desiredCount} managed, current` : "stale"}`);
        } catch (error) {
          context.out(`  User instructions: unavailable (${(error as Error).message})`);
        }
      } finally {
        await catalog.dispose();
      }
    } catch (error) {
      context.out(`  Marketplace cache: unavailable (${(error as Error).message})`);
      context.out("  User instructions: unavailable (Marketplace cache unavailable)");
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
  const counts = await projectCustomizationCounts(identity.workspaceRoot);
  context.out(`  Native skills: ${counts.skills}`);
  context.out(`  Native agents: ${counts.agents}`);
  context.out(`  Native hooks: ${counts.hooks}`);
  context.out(`  Native instructions: ${counts.instructions}`);
  context.out(`  copilot-instructions.md: ${counts.rootInstructions ? "present" : "missing"}`);
  const state = await readProjectState(identity.projectAnchor, context.homeDir);
  const projection = projectionFor(state, identity.workspaceRoot);
  context.out(`  Logical Projects: ${projection?.logicalProjects.join(", ") || "none"}`);
  context.out(`  Project plugins: ${projection?.managedProjectPlugins.join(", ") || "none"}`);
  context.out(`  Project context: ${projection ? projection.contextRoot : "not initialized"}`);
  context.out(`  Learnings projection: ${projection ? path.join(projection.contextRoot, "shared", "learnings") : "not initialized"}`);
  context.out("");
  context.out("Machine state");
  context.out(`  Partition: ${partitionPath(identity.projectAnchor, context.homeDir)}`);
  context.out(`  Last sync: ${state?.lastSync ?? "never"}`);
}
