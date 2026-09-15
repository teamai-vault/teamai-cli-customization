export const ROLES = ["api", "ios", "aos", "qa", "design"] as const;

export type Role = (typeof ROLES)[number];

export interface MarketplaceConfig {
  name: string;
  source: string;
}

export interface TeamAiConfig {
  version: 2;
  marketplace: MarketplaceConfig;
  role?: Role;
  managedPlugins?: string[];
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function createConfig(marketplace: MarketplaceConfig): TeamAiConfig {
  return {
    version: 2,
    marketplace,
    managedPlugins: [],
  };
}

export function validateConfig(value: unknown): TeamAiConfig {
  if (!value || typeof value !== "object") {
    throw new Error("Team AI config must be a YAML object.");
  }

  const candidate = value as {
    version?: unknown;
    marketplace?: { name?: unknown; source?: unknown; repository?: unknown };
    role?: unknown;
    managedPlugins?: unknown;
  };

  if (candidate.version !== 1 && candidate.version !== 2) {
    throw new Error(`Unsupported Team AI config version: ${String(candidate.version)}`);
  }
  if (!candidate.marketplace || typeof candidate.marketplace.name !== "string") {
    throw new Error("Team AI config requires marketplace.name.");
  }
  const source = candidate.version === 1 ? candidate.marketplace.repository : candidate.marketplace.source;
  if (typeof source !== "string" || source.length === 0) {
    throw new Error(candidate.version === 1
      ? "Team AI config requires marketplace.repository."
      : "Team AI config requires marketplace.source.");
  }
  if (candidate.role !== undefined && (typeof candidate.role !== "string" || !isRole(candidate.role))) {
    throw new Error(`Invalid role in Team AI config: ${String(candidate.role)}`);
  }
  if (candidate.managedPlugins !== undefined && (!Array.isArray(candidate.managedPlugins) || candidate.managedPlugins.some((item) => typeof item !== "string"))) {
    throw new Error("Team AI config managedPlugins must be a string array.");
  }

  return {
    version: 2,
    marketplace: {
      name: candidate.marketplace.name,
      source,
    },
    role: candidate.role as Role | undefined,
    managedPlugins: candidate.managedPlugins ?? [],
  };
}
