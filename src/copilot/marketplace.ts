import path from "node:path";
import type { MarketplaceConfig } from "../config/schema.js";
import type { CopilotClient, MarketplaceRow } from "./cli.js";

export function normalizeMarketplaceSource(source: string, cwd: string): string {
  if (/^[A-Za-z]:[\\/]/.test(source) || source.startsWith("/") || source.startsWith("./") || source.startsWith("../") || source.startsWith(".\\") || source.startsWith("..\\")) {
    return path.resolve(cwd, source);
  }
  return source;
}

export function marketplaceRowMatchesSource(row: MarketplaceRow, source: string): boolean {
  if (typeof row.source !== "string") return false;
  const registered = row.source.replace(/^(?:GitHub|URL|Local):\s*/, "");
  if (process.platform === "win32" && (/^[A-Za-z]:[\\/]/.test(source) || /^[A-Za-z]:[\\/]/.test(registered))) {
    return path.normalize(registered).toLowerCase() === path.normalize(source).toLowerCase();
  }
  return registered === source;
}

export async function resolveMarketplaceConfig(
  client: CopilotClient,
  source: string,
  options: { cwd: string; dryRun?: boolean },
): Promise<{ config: MarketplaceConfig; added: boolean } | undefined> {
  const before = await client.listMarketplaces(options.cwd);
  const existing = before.filter((item) => marketplaceRowMatchesSource(item, source));
  if (existing.length === 1) return { config: { name: existing[0].name, source }, added: false };
  if (existing.length > 1) {
    throw new Error(`Marketplace source '${source}' matches multiple existing Copilot registrations.`);
  }
  if (options.dryRun) return undefined;

  const beforeNames = new Set(before.map((item) => item.name));
  await client.addMarketplace(source, options.cwd);
  const after = await client.listMarketplaces(options.cwd);
  const added = after.filter((item) => !beforeNames.has(item.name));
  if (added.length !== 1) {
    throw new Error(`Could not uniquely discover the Marketplace name after registering '${source}'.`);
  }
  return { config: { name: added[0].name, source }, added: true };
}
