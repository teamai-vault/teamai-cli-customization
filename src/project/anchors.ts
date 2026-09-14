import path from "node:path";
import { realpath } from "node:fs/promises";
import { runProcess } from "../utils/process.js";

export interface ProjectIdentity {
  workspaceRoot: string;
  projectAnchor: string;
}

async function canonical(filePath: string): Promise<string> {
  try {
    return await realpath(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

export async function detectProjectIdentity(cwd: string): Promise<ProjectIdentity | undefined> {
  const rootResult = await runProcess("git", ["rev-parse", "--show-toplevel"], { cwd });
  if (rootResult.exitCode !== 0) return undefined;
  const workspaceRoot = await canonical(rootResult.stdout.trim());

  const commonResult = await runProcess("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd });
  if (commonResult.exitCode !== 0) {
    return { workspaceRoot, projectAnchor: workspaceRoot };
  }
  const commonDir = await canonical(commonResult.stdout.trim());
  const anchorCandidate = path.basename(commonDir).toLowerCase() === ".git" ? path.dirname(commonDir) : workspaceRoot;
  return { workspaceRoot, projectAnchor: await canonical(anchorCandidate) };
}
