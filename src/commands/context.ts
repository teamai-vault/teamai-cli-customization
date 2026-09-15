import os from "node:os";
import { FallbackCopilotClient } from "../copilot/fallback.js";
import { CopilotClient, CopilotUnavailableError, type CopilotOperations } from "../copilot/cli.js";
import { loadMarketplaceCatalog, type MarketplaceCatalog } from "../copilot/catalog.js";
import { executableVersion } from "../utils/process.js";
import { promptText, selectRole } from "../utils/prompt.js";
import { vscodeSettingsPath } from "../copilot/vscode-settings.js";

export interface CommandContext {
  cwd: string;
  homeDir: string;
  dryRun: boolean;
  copilot: CopilotOperations;
  copilotMode: "native" | "fallback" | "unavailable";
  vscodeAvailable: () => Promise<boolean>;
  vscodeSettingsPath: string;
  interactive: boolean;
  loadMarketplace: (source: string, cwd: string) => Promise<MarketplaceCatalog>;
  promptMarketplace: () => Promise<string>;
  promptRole: (roles: string[]) => Promise<string>;
  now: () => Date;
  out: (message: string) => void;
  err: (message: string) => void;
}

export function createCommandContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    cwd: overrides.cwd ?? process.cwd(),
    homeDir: overrides.homeDir ?? os.homedir(),
    dryRun: overrides.dryRun ?? false,
    copilot: overrides.copilot ?? new CopilotClient(),
    copilotMode: overrides.copilotMode ?? "native",
    vscodeAvailable: overrides.vscodeAvailable ?? (async () => (await executableVersion("code", ["--version"])) !== undefined),
    vscodeSettingsPath: overrides.vscodeSettingsPath ?? vscodeSettingsPath(overrides.homeDir ?? os.homedir()),
    interactive: overrides.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY),
    loadMarketplace: overrides.loadMarketplace ?? loadMarketplaceCatalog,
    promptMarketplace: overrides.promptMarketplace ?? (() => promptText("? Department Marketplace URL: ")),
    promptRole: overrides.promptRole ?? ((roles) => selectRole(roles)),
    now: overrides.now ?? (() => new Date()),
    out: overrides.out ?? ((message) => console.log(message)),
    err: overrides.err ?? ((message) => console.error(message)),
  };
}

export async function resolveCopilotBackend(context: CommandContext): Promise<void> {
  try {
    await context.copilot.version();
  } catch (error) {
    if (error instanceof CopilotUnavailableError && await context.vscodeAvailable()) {
      context.copilot = new FallbackCopilotClient(context.homeDir, context.now, context.loadMarketplace);
      context.copilotMode = "fallback";
    } else if (error instanceof CopilotUnavailableError) {
      context.copilotMode = "unavailable";
    }
  }
}
