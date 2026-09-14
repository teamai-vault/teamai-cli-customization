export const ROLES = ["api", "ios", "aos", "qa", "design"] as const;

export type Role = (typeof ROLES)[number];

export interface MarketplaceConfig {
  name: string;
  repository: string;
}

export interface TeamAiConfig {
  version: 1;
  marketplace: MarketplaceConfig;
  role?: Role;
  managedPlugins?: string[];
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function createDefaultConfig(marketplaceSource?: string): TeamAiConfig {
  return {
    version: 1,
    marketplace: {
      name: "teamai",
      repository: marketplaceSource ?? "teamai-vault/teamai-marketplace",
    },
    managedPlugins: [],
  };
}

export function validateConfig(value: unknown): TeamAiConfig {
  if (!value || typeof value !== "object") {
    throw new Error("Team AI config must be a YAML object.");
  }

  const candidate = value as Partial<TeamAiConfig> & {
    marketplace?: Partial<MarketplaceConfig>;
  };

  if (candidate.version !== 1) {
    throw new Error(`Unsupported Team AI config version: ${String(candidate.version)}`);
  }
  if (!candidate.marketplace || typeof candidate.marketplace.name !== "string" || typeof candidate.marketplace.repository !== "string") {
    throw new Error("Team AI config requires marketplace.name and marketplace.repository.");
  }
  if (candidate.role !== undefined && !isRole(candidate.role)) {
    throw new Error(`Invalid role in Team AI config: ${String(candidate.role)}`);
  }
  if (candidate.managedPlugins !== undefined && (!Array.isArray(candidate.managedPlugins) || candidate.managedPlugins.some((item) => typeof item !== "string"))) {
    throw new Error("Team AI config managedPlugins must be a string array.");
  }

  return {
    version: 1,
    marketplace: {
      name: candidate.marketplace.name,
      repository: candidate.marketplace.repository,
    },
    role: candidate.role,
    managedPlugins: candidate.managedPlugins ?? [],
  };
}
