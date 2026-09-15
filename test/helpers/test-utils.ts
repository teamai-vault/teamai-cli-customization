import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CopilotClient } from "../../src/copilot/cli.js";
import { runProcess } from "../../src/utils/process.js";

export const TEST_MARKETPLACE_NAME = "test-team-ai";
export const TEST_MARKETPLACE_SOURCE = "https://github.com/test-org/teamai-marketplace.git";

export interface FakeCopilotState {
  marketplaceName: string;
  marketplaces: Array<{ name: string; source?: string }>;
  plugins: Array<{ name: string; marketplace?: string; version?: string; enabled: boolean; source?: string }>;
  catalog: Record<string, Array<{ name: string; version: string }>>;
}

export async function tempDir(prefix: string): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function createFakeCopilot(initial?: Partial<FakeCopilotState>): Promise<{
  client: CopilotClient;
  statePath: string;
  readState: () => Promise<FakeCopilotState>;
}> {
  const directory = await tempDir("team-ai-fake-copilot-");
  const statePath = path.join(directory, "state.json");
  const state: FakeCopilotState = {
    marketplaceName: initial?.marketplaceName ?? TEST_MARKETPLACE_NAME,
    marketplaces: initial?.marketplaces ?? [],
    plugins: initial?.plugins ?? [],
    catalog: initial?.catalog ?? {
      [initial?.marketplaceName ?? TEST_MARKETPLACE_NAME]: [
        { name: "common", version: "0.1.0" },
        { name: "role-api", version: "0.1.0" },
        { name: "role-ios", version: "0.1.0" },
        { name: "role-aos", version: "0.1.0" },
        { name: "role-qa", version: "0.1.0" },
        { name: "role-design", version: "0.1.0" },
      ],
    },
  };
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  const helperPath = fileURLToPath(new URL("./fake-copilot.mjs", import.meta.url));
  return {
    client: new CopilotClient(process.execPath, [helperPath, statePath]),
    statePath,
    readState: async () => JSON.parse(await readFile(statePath, "utf8")) as FakeCopilotState,
  };
}

export async function createGitRepo(): Promise<string> {
  const root = await tempDir("team-ai-git-");
  const init = await runProcess("git", ["init", "-b", "main"], { cwd: root });
  if (init.exitCode !== 0) throw new Error(init.stderr);
  await runProcess("git", ["config", "user.email", "team-ai@example.invalid"], { cwd: root });
  await runProcess("git", ["config", "user.name", "Team AI Test"], { cwd: root });
  await writeFile(path.join(root, "README.md"), "# test\n", "utf8");
  await runProcess("git", ["add", "README.md"], { cwd: root });
  const commit = await runProcess("git", ["commit", "-m", "initial"], { cwd: root });
  if (commit.exitCode !== 0) throw new Error(commit.stderr);
  return root;
}
