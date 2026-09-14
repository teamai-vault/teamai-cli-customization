import { readGlobalConfig, writeGlobalConfig } from "../config/global.js";
import { isRole, ROLES } from "../config/schema.js";
import { convergeUserPlugins } from "../copilot/plugins.js";
import type { CommandContext } from "./context.js";
import { printActions, printWarnings } from "./helpers.js";

export function roleListCommand(context: CommandContext): void {
  for (const role of ROLES) context.out(role);
}

export async function roleSetCommand(context: CommandContext, role: string): Promise<void> {
  if (!isRole(role)) throw new Error(`Unknown role '${role}'. Expected one of: ${ROLES.join(", ")}.`);
  const current = await readGlobalConfig(context.homeDir);
  if (!current) throw new Error("Team AI is not initialized. Run `team-ai init --role <role>` first.");

  const previousSpec = current.role ? `role-${current.role}@${current.marketplace.name}` : undefined;
  const next = { ...current, role };
  const converged = await convergeUserPlugins(context.copilot, next, {
    dryRun: context.dryRun,
    cwd: context.cwd,
    disableSpecs: previousSpec ? [previousSpec] : [],
  });
  printActions(converged.actions, context.dryRun, context.out);
  printWarnings(converged.warnings, context.out);
  next.managedPlugins = converged.managedPlugins;
  if (!context.dryRun) await writeGlobalConfig(next, context.homeDir);
  else context.out("WOULD write: ~/.team-ai/config.yaml");
  context.out(`Role: ${role}`);
}
