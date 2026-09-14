import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { teamAiHome } from "../config/global.js";

export function normalizeAnchor(anchor: string, platform: NodeJS.Platform = process.platform): string {
  let normalized = path.normalize(anchor).replaceAll("\\", "/").replace(/\/+$/, "");
  if (platform === "win32" || /^[A-Za-z]:\//.test(normalized)) normalized = normalized.toLowerCase();
  return normalized;
}

export function partitionSlug(anchor: string, platform: NodeJS.Platform = process.platform): string {
  const normalized = normalizeAnchor(anchor, platform);
  const safe = normalized
    .replace(/^[a-z]:\//i, (match) => `${match[0]}-/`)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-80) || "project";
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  return `${safe}-${hash}`;
}

export function partitionPath(projectAnchor: string, homeDir = os.homedir()): string {
  return path.join(teamAiHome(homeDir), "projects", partitionSlug(projectAnchor));
}
