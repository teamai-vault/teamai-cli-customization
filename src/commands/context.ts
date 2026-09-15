import os from "node:os";
import { CopilotClient } from "../copilot/cli.js";

export interface CommandContext {
  cwd: string;
  homeDir: string;
  dryRun: boolean;
  copilot: CopilotClient;
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
    now: overrides.now ?? (() => new Date()),
    out: overrides.out ?? ((message) => console.log(message)),
    err: overrides.err ?? ((message) => console.error(message)),
  };
}
