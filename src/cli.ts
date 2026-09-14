#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { createCommandContext, type CommandContext } from "./commands/context.js";
import { doctorCommand } from "./commands/doctor.js";
import { initCommand } from "./commands/init.js";
import { roleListCommand, roleSetCommand } from "./commands/role.js";
import { statusCommand } from "./commands/status.js";
import { syncCommand } from "./commands/sync.js";

const VERSION = "0.1.0";

function usage(): string {
  return [
    "team-ai <command> [options]",
    "",
    "Commands:",
    "  init [--role api|ios|aos|qa|design] [--product <name>]",
    "  sync",
    "  role list",
    "  role set <role>",
    "  status",
    "  doctor",
    "",
    "Global options:",
    "  --dry-run   Preview writes and Copilot mutations",
    "  --help      Show help",
    "  --version   Show version",
  ].join("\n");
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

export async function runCli(argv: string[], overrides: Partial<CommandContext> = {}): Promise<number> {
  const dryRun = argv.includes("--dry-run");
  const args = argv.filter((arg) => arg !== "--dry-run");
  const context = createCommandContext({ ...overrides, dryRun });

  if (args.length === 0 || args.includes("--help") || args[0] === "help") {
    context.out(usage());
    return 0;
  }
  if (args.includes("--version")) {
    context.out(VERSION);
    return 0;
  }

  try {
    switch (args[0]) {
      case "init":
        await initCommand(context, { role: optionValue(args, "--role"), product: optionValue(args, "--product") });
        return 0;
      case "sync":
        await syncCommand(context);
        return 0;
      case "role":
        if (args[1] === "list") {
          roleListCommand(context);
          return 0;
        }
        if (args[1] === "set" && args[2]) {
          await roleSetCommand(context, args[2]);
          return 0;
        }
        throw new Error("Use `team-ai role list` or `team-ai role set <role>`. ");
      case "status":
        await statusCommand(context);
        return 0;
      case "doctor": {
        const result = await doctorCommand(context);
        return result.errors > 0 ? 1 : 0;
      }
      default:
        throw new Error(`Unknown command '${args[0]}'.\n${usage()}`);
    }
  } catch (error) {
    context.err(`ERROR: ${(error as Error).message}`);
    return 1;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  process.exitCode = await runCli(process.argv.slice(2));
}
