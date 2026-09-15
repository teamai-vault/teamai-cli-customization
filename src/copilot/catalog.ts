import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runProcess } from "../utils/process.js";

export const TEAM_AI_EXTENSION_NAMESPACE = "com.company.teamai";
const AGENT_PLUGIN_NAME = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/;

export type TeamAiPluginKind = "common" | "role" | "product";

export interface CatalogPlugin {
  name: string;
  version: string;
  kind: TeamAiPluginKind;
  root: string;
}

export interface MarketplaceCatalog {
  name: string;
  plugins: CatalogPlugin[];
  dispose: () => Promise<void>;
}

interface MarketplaceManifest {
  name?: unknown;
  plugins?: Array<{ name?: unknown; version?: unknown; source?: unknown }>;
}

interface PluginManifest {
  name?: unknown;
  version?: unknown;
  extensions?: Record<string, { kind?: unknown }>;
}

export async function loadMarketplaceCatalog(source: string, cwd: string): Promise<MarketplaceCatalog> {
  const materialized = await materializeMarketplace(source, cwd);
  try {
    const root = await realpath(materialized.root);
    const manifest = await readJson<MarketplaceManifest>(path.join(root, ".github", "plugin", "marketplace.json"));
    if (typeof manifest.name !== "string" || !AGENT_PLUGIN_NAME.test(manifest.name) || !Array.isArray(manifest.plugins)) {
      throw new Error("Marketplace manifest requires name and plugins.");
    }

    const plugins = await Promise.all(manifest.plugins.map(async (entry) => {
      if (typeof entry.name !== "string" || !AGENT_PLUGIN_NAME.test(entry.name) || typeof entry.version !== "string" || typeof entry.source !== "string") {
        throw new Error("Marketplace plugin entries require name, version, and source.");
      }
      const pluginRoot = await realpath(path.resolve(root, entry.source));
      if (isOutside(root, pluginRoot)) throw new Error(`${entry.name}: plugin source must stay inside the Marketplace.`);
      const plugin = await readJson<PluginManifest>(path.join(pluginRoot, "plugin.json"));
      if (plugin.name !== entry.name || plugin.version !== entry.version) {
        throw new Error(`${entry.name}: Marketplace entry does not match plugin.json name/version.`);
      }
      const kind = plugin.extensions?.[TEAM_AI_EXTENSION_NAMESPACE]?.kind;
      if (kind !== "common" && kind !== "role" && kind !== "product") {
        throw new Error(`${entry.name}: plugin.json requires extensions.${TEAM_AI_EXTENSION_NAMESPACE}.kind (common, role, or product).`);
      }
      return { name: entry.name, version: entry.version, kind: kind as TeamAiPluginKind, root: pluginRoot };
    }));

    if (plugins.filter((plugin) => plugin.kind === "common").length !== 1) {
      throw new Error("Marketplace must contain exactly one Team AI common plugin.");
    }
    if (!plugins.some((plugin) => plugin.kind === "role")) {
      throw new Error("Marketplace must contain at least one Team AI role plugin.");
    }
    return { name: manifest.name, plugins, dispose: materialized.dispose };
  } catch (error) {
    await materialized.dispose();
    throw error;
  }
}

async function materializeMarketplace(source: string, cwd: string): Promise<{ root: string; dispose: () => Promise<void> }> {
  const local = path.resolve(cwd, source);
  try {
    if ((await stat(local)).isDirectory()) return { root: local, dispose: async () => undefined };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "team-ai-marketplace-"));
  const checkout = path.join(temporaryRoot, "checkout");
  const { url, ref } = gitSource(source);
  const clone = await runProcess("git", ["clone", "--depth", "1", url, checkout], { cwd });
  if (clone.exitCode !== 0) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw new Error(`Could not clone Marketplace '${source}': ${clone.stderr.trim() || clone.stdout.trim()}`);
  }
  if (ref) {
    const fetch = await runProcess("git", ["fetch", "--depth", "1", "origin", ref], { cwd: checkout });
    const checkoutRef = fetch.exitCode === 0
      ? await runProcess("git", ["checkout", "--detach", "FETCH_HEAD"], { cwd: checkout })
      : fetch;
    if (checkoutRef.exitCode !== 0) {
      await rm(temporaryRoot, { recursive: true, force: true });
      throw new Error(`Could not checkout Marketplace ref '${ref}': ${checkoutRef.stderr.trim() || checkoutRef.stdout.trim()}`);
    }
  }
  return {
    root: checkout,
    dispose: async () => rm(temporaryRoot, { recursive: true, force: true }),
  };
}

function gitSource(source: string): { url: string; ref?: string } {
  const shorthand = source.match(/^([^/\s]+)\/([^/#\s]+)(?:#(.+))?$/);
  if (!shorthand) return { url: source };
  return {
    url: `https://github.com/${shorthand[1]}/${shorthand[2]}.git`,
    ref: shorthand[3],
  };
}

function isOutside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

async function readJson<T>(filePath: string): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${filePath} contains invalid JSON.`);
    throw error;
  }
}
