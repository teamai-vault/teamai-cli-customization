import os from "node:os";
import path from "node:path";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { atomicWriteText, readTextIfExists } from "../utils/fs.js";

const MARKETPLACES_KEY = "chat.plugins.marketplaces";

export function vscodeSettingsPath(homeDir: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") {
    const appData = path.resolve(homeDir) === path.resolve(os.homedir()) && process.env.APPDATA
      ? process.env.APPDATA
      : path.join(homeDir, "AppData", "Roaming");
    return path.join(appData, "Code", "User", "settings.json");
  }
  if (platform === "darwin") return path.join(homeDir, "Library", "Application Support", "Code", "User", "settings.json");
  return path.join(homeDir, ".config", "Code", "User", "settings.json");
}

export function mergeVsCodeMarketplace(contents: string | undefined, source: string): string {
  const original = contents?.trim() ? contents : "{}\n";
  const errors: ParseError[] = [];
  const settings = parse(original, errors, { allowTrailingComma: true, disallowComments: false }) as Record<string, unknown> | undefined;
  if (errors.length > 0 || !settings || Array.isArray(settings)) throw new Error("VS Code User Settings contains invalid JSONC.");
  const current = settings[MARKETPLACES_KEY];
  if (current !== undefined && (!Array.isArray(current) || current.some((item) => typeof item !== "string"))) {
    throw new Error(`VS Code User Settings ${MARKETPLACES_KEY} must be an array of strings.`);
  }

  const marketplaces = (current ?? []) as string[];
  const index = marketplaces.indexOf(source);
  if (index === 0) return original;
  const options = { formattingOptions: formatting(original) };
  if (index > 0) {
    const moved = applyEdits(original, modify(original, [MARKETPLACES_KEY, index], marketplaces[0], options));
    return applyEdits(moved, modify(moved, [MARKETPLACES_KEY, 0], source, options));
  }
  return applyEdits(original, modify(original, [MARKETPLACES_KEY, 0], source, { ...options, isArrayInsertion: true }));
}

export async function registerVsCodeMarketplace(
  settingsPath: string,
  source: string,
  dryRun = false,
): Promise<boolean> {
  const current = await readTextIfExists(settingsPath);
  const merged = mergeVsCodeMarketplace(current, source);
  if (merged === current) return false;
  if (!dryRun) await atomicWriteText(settingsPath, merged);
  return true;
}

function formatting(contents: string): { insertSpaces: boolean; tabSize: number; eol: string } {
  return {
    insertSpaces: !/^\t+\S/m.test(contents),
    tabSize: 2,
    eol: contents.includes("\r\n") ? "\r\n" : "\n",
  };
}
