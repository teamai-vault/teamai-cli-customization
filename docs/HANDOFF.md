# Team AI CLI — Handoff

> Updated: 2026-09-15
> Branch: `feat/frozen-design-delta`
> Repositories: `teamai-vault/teamai-cli-customization`, `teamai-vault/teamai-marketplace`
> Status: frozen design delta implemented; documentation aligned with the checked-in code

## 1. Frozen contract

The project keeps one company-wide CLI and one configured department Marketplace per user. The Marketplace is supplied as a source; its manifest name is discovered and persisted. The CLI remains an orchestrator around native Agent Plugin and Copilot behavior.

The scope model is unchanged:

```text
Common  -> User Plugin
Role    -> User Plugin
Product -> Repo-enabled Plugin
Project -> real business Git repository .github/*
```

Copilot CLI is the preferred backend. If Copilot CLI is unavailable but VS Code is available, the CLI uses its compatible filesystem/metadata fallback. No custom runtime, IDE abstraction, overlay engine, Marketplace merge layer, knowledge runtime, or telemetry subsystem was added.

## 2. Current repositories and catalog

`teamai-marketplace` is the reference/template Marketplace. Its canonical manifest is:

```text
.github/plugin/marketplace.json
```

The current catalog version is `0.2.0`; the current CLI package version is `0.2.0`.

The reference catalog contains:

```text
common
api
ios
aos
qa
design
product-teamai
```

The first six names are the Common and Role user plugins. `product-teamai` is the current Product example and is enabled from a business repository; Product plugins are not part of the user-scope install set.

Plugin kind is metadata, not a naming prefix. The CLI and every reference Marketplace `plugin.json` use the stable namespace `com.company.teamai`:

```json
{
  "name": "api",
  "version": "0.1.0",
  "extensions": {
    "com.company.teamai": {
      "kind": "role"
    }
  }
}
```

The CLI reads `extensions.com.company.teamai.kind` and accepts `common`, `role`, or `product`. If the namespace changes, update both `TEAM_AI_EXTENSION_NAMESPACE` in the CLI and the namespace in every Marketplace `plugin.json`.

## 3. Config contract

The machine config is:

```text
~/.team-ai/config.yaml
```

Its only supported schema is version `1` with `marketplace.source`:

```yaml
version: 1
marketplace:
  name: payments-ai
  source: https://github.com/example-org/payments-ai-marketplace.git
role: api
managedPlugins:
  - common@payments-ai
  - api@payments-ai
  - ios@payments-ai
  - aos@payments-ai
  - qa@payments-ai
  - design@payments-ai
```

A configured Marketplace source is not silently replaced by a different source. Relative local sources are normalized to absolute paths before persistence.

`managedPlugins` is the explicit Team AI ownership record. It is updated only from convergence results; names alone never establish ownership.

## 4. Initialization and role behavior

First-time `init` supports all four combinations:

```text
team-ai init                                             # prompt for Marketplace and Role
team-ai init --marketplace <source>                      # prompt for Role
team-ai init --role api                                  # prompt for Marketplace
team-ai init --marketplace <source> --role api           # no prompts
```

Interactive role selection is limited to the `kind: role` plugins exposed by the selected Marketplace and chooses exactly one. In non-TTY environments, missing Marketplace or Role values are errors; the CLI never enters a prompt. Automation supplies both values:

```text
team-ai init --marketplace <source> --role <role>
```

Convergence installs `common` and every role-kind plugin in the catalog, then enables only `common` and the selected Role. A role change keeps the installed role set, enables the new Role, and disables other Team AI-owned Roles. Product plugins are validated and declared through repository settings only when requested.

## 5. Native backend

When `copilot` is available, the CLI uses the native plural command family:

```text
copilot plugins marketplace add <source>
copilot plugins marketplace list --json
copilot plugins marketplace browse <name> --json
copilot plugins list --kind plugin --json
copilot plugins install <plugin>@<marketplace>
copilot plugins enable <plugin>@<marketplace>
copilot plugins disable <plugin>@<marketplace>
copilot plugins update <plugin>@<marketplace>
```

Team AI does not recreate native Copilot installation or execution behavior. `status` and `doctor` inspect native MCP metadata where the Copilot CLI exposes it. Hook declarations are validated as Marketplace content; unavailable live Hook inspection is reported and no Hook is executed as a probe.

## 6. VS Code-only fallback

When `copilot` is unavailable and `code` is available, Team AI uses the compatible fallback. It loads the Marketplace manifest and plugin metadata, materializes Common and all Role plugins, and updates Copilot-compatible state:

```text
~/.copilot/installed-plugins/<marketplace>/<plugin>
~/.copilot/config.json
~/.copilot/settings.json
```

Fallback behavior is intentionally small and native-shaped:

- `config.json.installedPlugins` records the materialized inventory;
- `settings.json.enabledPlugins` is effective enablement authority;
- the inventory `enabled` flag is kept in sync with that authority;
- unknown fields in both files and existing `source_sha` values are preserved;
- fallback-created rows do not calculate a synthetic `source_sha`;
- writes are locked, merged, and atomic.

The fallback also uses `extraKnownMarketplaces` in `~/.copilot/settings.json` and preserves existing Marketplace entry fields while replacing only the configured source mapping.

## 7. VS Code and repository settings

In addition to Copilot user registration, Team AI updates VS Code User Settings:

```text
chat.plugins.marketplaces
```

The merge is JSONC-safe: comments and trailing commas are accepted, unknown settings remain intact, and the configured source is inserted or moved to array index `0` while preserving other entries.

Product declarations stay in the real business repository:

```text
.github/copilot/settings.json
```

The CLI read-modify-writes only its relevant `extraKnownMarketplaces` and `enabledPlugins` entries, validates a Product plugin before writing, and preserves unrelated fields, Marketplaces, and plugins.

## 8. Project, ownership, and YAGNI boundaries

Project means the real Git repository. Project-specific Skills, Agents, Instructions, Hooks, and other Copilot customization remain under that repository's `.github/*`; Project is not a Plugin kind.

Machine state is partitioned by the stable Git project anchor:

```text
~/.team-ai/
  config.yaml
  projects/
    <safe-anchor>-<hash>/
      anchor
      state.json
```

Only explicitly Team AI-managed plugins may be installed, enabled, disabled, updated, or repaired by Team AI. User-owned and third-party plugin state is preserved.

YAGNI remains a design constraint. Deferred work includes multiple-Marketplace selection/merge/overlay/precedence, package management, generic IDE/provider abstraction, custom capability formats, resource injection/copying, telemetry, dashboards, knowledge retrieval, TeamWiki/Recall/Learning, and a custom Product/Project database.

## 9. Validation status for this branch

The following checks passed on `feat/frozen-design-delta`:

```text
npm run typecheck        PASS
npm run test:unit        PASS
npm run test:integration PASS
npm run build            PASS
npm run test:e2e:copilot PASS — real native Copilot E2E on Windows
npm run test:e2e:fallback PASS — real VS Code-only fallback E2E on Windows
```

The native E2E builds the CLI, uses the real installed Copilot CLI with an isolated temporary profile and Git repository, installs all Common/Role plugins, verifies Common plus one Role enabled, checks Product repository settings, and verifies VS Code Marketplace registration.

The fallback E2E removes Copilot CLI from the test PATH, uses a real VS Code-compatible `code` command, materializes the local Marketplace into `~/.copilot/installed-plugins`, checks merged Copilot config/settings and enablement, then verifies that the real Copilot CLI recognizes the materialized plugins. Both scripts clean their temporary state in a `finally` path.

No macOS native or fallback E2E result is claimed for this branch.

## 10. Safe continuation rules

1. Preserve the native Copilot and Git-native boundaries.
2. Keep `version: 1` with `marketplace.source` as the config contract.
3. Discover Common, Role, and Product by `extensions.com.company.teamai.kind`, not by name prefixes.
4. Keep Common plus all Roles installed and Common plus exactly one Role enabled.
5. Preserve unknown Copilot/VS Code fields and user-owned plugin state.
6. Keep Product declarations in repository settings and Project customization in `.github/*`.
7. Do not add a custom Hook/MCP injector or runtime.
8. Do not claim fake integration as real E2E, and do not infer macOS results from Windows evidence.
9. Keep new capability families behind a concrete use case, owner, and security review.
