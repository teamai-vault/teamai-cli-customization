import os from "node:os";
import { CopilotClient } from "../copilot/cli.js";
import { loadMarketplaceCatalog, type MarketplaceCatalog } from "../copilot/catalog.js";
import { promptText, selectRole } from "../utils/prompt.js";

export interface CommandContext {
  cwd: string;
  homeDir: string;
  dryRun: boolean;
  copilot: CopilotClient;
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
    interactive: overrides.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY),
    loadMarketplace: overrides.loadMarketplace ?? loadMarketplaceCatalog,
    promptMarketplace: overrides.promptMarketplace ?? (() => promptText("? Department Marketplace URL: ")),
    promptRole: overrides.promptRole ?? ((roles) => selectRole(roles)),
    now: overrides.now ?? (() => new Date()),
    out: overrides.out ?? ((message) => console.log(message)),
    err: overrides.err ?? ((message) => console.error(message)),
  };
}
