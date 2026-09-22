export type Role = string;

export interface MarketplaceConfig {
  name: string;
  source: string;
}

export interface TeamAiConfig {
  version: 1;
  marketplace: MarketplaceConfig;
  marketplaceRevision?: string;
  role?: Role;
  managedPlugins?: string[];
  managedSkills?: string[];
  managedSkillPaths?: Record<string, string>;
}

export function createConfig(marketplace: MarketplaceConfig): TeamAiConfig {
  return {
    version: 1,
    marketplace,
    managedPlugins: [],
    managedSkills: [],
    managedSkillPaths: {},
  };
}

export function validateConfig(value: unknown): TeamAiConfig {
  if (!value || typeof value !== "object") {
    throw new Error("Team AI config must be a YAML object.");
  }

  const candidate = value as {
    version?: unknown;
    marketplace?: { name?: unknown; source?: unknown };
    marketplaceRevision?: unknown;
    role?: unknown;
    managedPlugins?: unknown;
    managedSkills?: unknown;
    managedSkillPaths?: unknown;
  };

  if (candidate.version !== 1) {
    throw new Error(`Unsupported Team AI config version: ${String(candidate.version)}`);
  }
  if (!candidate.marketplace || typeof candidate.marketplace.name !== "string") {
    throw new Error("Team AI config requires marketplace.name.");
  }
  const source = candidate.marketplace.source;
  if (typeof source !== "string" || source.length === 0) {
    throw new Error("Team AI config requires marketplace.source.");
  }
  if (candidate.marketplaceRevision !== undefined && (typeof candidate.marketplaceRevision !== "string" || candidate.marketplaceRevision.length === 0)) {
    throw new Error(`Invalid marketplace revision in Team AI config: ${String(candidate.marketplaceRevision)}`);
  }
  if (candidate.role !== undefined && (typeof candidate.role !== "string" || candidate.role.length === 0)) {
    throw new Error(`Invalid role in Team AI config: ${String(candidate.role)}`);
  }
  if (candidate.managedPlugins !== undefined && (!Array.isArray(candidate.managedPlugins) || candidate.managedPlugins.some((item) => typeof item !== "string"))) {
    throw new Error("Team AI config managedPlugins must be a string array.");
  }
  if (candidate.managedSkills !== undefined && (!Array.isArray(candidate.managedSkills) || candidate.managedSkills.some((item) => typeof item !== "string"))) {
    throw new Error("Team AI config managedSkills must be a string array.");
  }
  if (candidate.managedSkillPaths !== undefined && (!candidate.managedSkillPaths || typeof candidate.managedSkillPaths !== "object" || Array.isArray(candidate.managedSkillPaths) || Object.entries(candidate.managedSkillPaths).some(([name, target]) => typeof name !== "string" || typeof target !== "string"))) {
    throw new Error("Team AI config managedSkillPaths must map skill names to paths.");
  }

  return {
    version: 1,
    marketplace: {
      name: candidate.marketplace.name,
      source,
    },
    marketplaceRevision: candidate.marketplaceRevision as string | undefined,
    role: candidate.role as Role | undefined,
    managedPlugins: candidate.managedPlugins ?? [],
    managedSkills: candidate.managedSkills ?? [],
    managedSkillPaths: candidate.managedSkillPaths as Record<string, string> | undefined ?? {},
  };
}
