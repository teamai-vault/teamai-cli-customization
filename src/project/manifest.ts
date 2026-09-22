import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type { CatalogPlugin } from "../copilot/catalog.js";

const PROJECT_ID = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/;

export interface LogicalProject {
  id: string;
  name: string;
  description: string;
  owners: string[];
  plugin?: string;
}

export async function loadLogicalProjects(marketplaceRoot: string, plugins: CatalogPlugin[]): Promise<LogicalProject[]> {
  const manifestPath = path.join(marketplaceRoot, "manifest", "projects.yaml");
  try {
    const info = await lstat(manifestPath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Logical Project manifest is unsafe: ${manifestPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const parsed = parse(await readFile(manifestPath, "utf8")) as { version?: unknown; projects?: unknown };
  if (parsed?.version !== 1 || !Array.isArray(parsed.projects)) {
    throw new Error("Logical Project manifest requires version: 1 and projects.");
  }
  const seen = new Set<string>();
  return parsed.projects.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Logical Project entry ${index + 1} must be an object.`);
    }
    const candidate = entry as Partial<LogicalProject>;
    if (typeof candidate.id !== "string" || !PROJECT_ID.test(candidate.id) || candidate.id === "shared" || seen.has(candidate.id)) {
      throw new Error(`Logical Project entry ${index + 1} requires a unique safe id.`);
    }
    if (typeof candidate.name !== "string" || !candidate.name || typeof candidate.description !== "string" || !candidate.description) {
      throw new Error(`Logical Project '${candidate.id}' requires name and description.`);
    }
    if (!Array.isArray(candidate.owners) || candidate.owners.length === 0 || candidate.owners.some((owner) => typeof owner !== "string" || !owner.trim())) {
      throw new Error(`Logical Project '${candidate.id}' requires at least one owner.`);
    }
    if (candidate.plugin !== undefined && (!plugins.some((plugin) => plugin.name === candidate.plugin && plugin.kind === "project"))) {
      throw new Error(`Logical Project '${candidate.id}' plugin '${String(candidate.plugin)}' must exist and have kind project.`);
    }
    seen.add(candidate.id!);
    return { id: candidate.id!, name: candidate.name, description: candidate.description, owners: candidate.owners, plugin: candidate.plugin };
  });
}

export function parseLogicalProjectIds(values: string[]): string[] {
  const ids = values.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  if (ids.some((id) => !PROJECT_ID.test(id))) throw new Error("Logical Project IDs must be safe Marketplace IDs.");
  return [...new Set(ids)];
}

export function selectedLogicalProjects(projects: LogicalProject[], ids: string[]): LogicalProject[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  return ids.map((id) => {
    const project = byId.get(id);
    if (!project) throw new Error(`Unknown Logical Project '${id}'.`);
    return project;
  });
}
