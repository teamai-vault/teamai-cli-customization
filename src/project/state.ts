import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { teamAiHome } from "../config/global.js";
import { atomicWriteJson, atomicWriteText, readJsonIfExists, readTextIfExists, withFileLock } from "../utils/fs.js";
import { normalizeAnchor, partitionPath } from "./partition.js";

export interface ProjectState {
  schemaVersion: 1;
  workspaceRoot: string;
  lastSync: string;
  managedPlugins: string[];
  projections?: Record<string, ProjectProjection>;
}

export interface ProjectProjection {
  workspaceRoot: string;
  logicalProjects: string[];
  managedProjectPlugins: string[];
  instructionRoot: string;
  contextRoot: string;
}

export interface PartitionDiagnostic {
  partition: string;
  kind: "orphan" | "stale";
  anchor?: string;
}

export async function readProjectState(projectAnchor: string, homeDir: string): Promise<ProjectState | undefined> {
  return await readJsonIfExists<ProjectState>(path.join(partitionPath(projectAnchor, homeDir), "state.json"));
}

export async function writeProjectState(
  projectAnchor: string,
  state: ProjectState,
  homeDir: string,
): Promise<void> {
  const root = partitionPath(projectAnchor, homeDir);
  await withFileLock(path.join(root, ".lock"), async () => {
    const anchorFile = path.join(root, "anchor");
    const existingAnchor = await readTextIfExists(anchorFile);
    if (existingAnchor !== undefined && normalizeAnchor(existingAnchor.trim()) !== normalizeAnchor(projectAnchor)) {
      throw new Error(`Partition collision detected at ${root}`);
    }
    await atomicWriteText(anchorFile, `${projectAnchor}\n`);
    await atomicWriteJson(path.join(root, "state.json"), state);
  });
}

export async function inspectProjectPartitions(homeDir: string): Promise<PartitionDiagnostic[]> {
  const projectsRoot = path.join(teamAiHome(homeDir), "projects");
  let entries;
  try {
    entries = await readdir(projectsRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const diagnostics: PartitionDiagnostic[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const partition = path.join(projectsRoot, entry.name);
    const rawAnchor = await readTextIfExists(path.join(partition, "anchor"));
    const anchor = rawAnchor?.trim();
    if (!anchor) {
      diagnostics.push({ partition, kind: "orphan" });
      continue;
    }
    try {
      await stat(anchor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        diagnostics.push({ partition, kind: "stale", anchor });
        continue;
      }
      throw error;
    }
  }
  return diagnostics;
}
