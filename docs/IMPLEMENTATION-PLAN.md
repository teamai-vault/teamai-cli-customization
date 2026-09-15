# Team AI CLI — Frozen Delta Implementation Plan

> Status: implemented on `feat/frozen-design-delta`
> Scope: synchronize the CLI with the final frozen contract and keep the implementation minimal
> Source design: `docs/04-team-ai-final-frozen-design.md` in the design workspace

## 1. Goal

Deliver one company-wide, Copilot-native CLI that binds a user to one department Marketplace source and converges native Agent Plugin state. The CLI must support a native Copilot backend first and a compatible VS Code-only fallback when Copilot CLI is unavailable.

The four capability boundaries remain:

```text
Common  -> User Plugin
Role    -> User Plugin
Product -> Repo-enabled Plugin
Project -> real business Git repository .github/*
```

The implementation must not become another agent runtime, package manager, IDE abstraction, resource copier, overlay engine, or knowledge system.

## 2. Frozen contracts

### Config

The only Team AI config shape is:

```yaml
version: 1
marketplace:
  name: <manifest-derived-name>
  source: <copilot-marketplace-source>
role: <selected-role>
managedPlugins: []
```

`marketplace.source` is the only persisted source field. A different source after initialization is rejected instead of silently rebinding. Relative local paths are normalized before persistence.

### Role names and plugin kinds

Role Plugin names are bare Marketplace names:

```text
api
ios
aos
qa
design
```

The kind is read from:

```text
extensions.com.company.teamai.kind
```

The accepted kinds are `common`, `role`, and `product`. Naming prefixes are not used to infer kind. The namespace is shared by all department Marketplaces. A namespace change updates `TEAM_AI_EXTENSION_NAMESPACE` in the CLI and the `extensions` namespace in every Marketplace `plugin.json`.

### Installation and enablement

For a clean initialization, install:

```text
common + every kind: role plugin
```

Enable only:

```text
common + the selected Role
```

Product plugins are not included in user-scope installation. A role switch changes enablement and preserves the installed role set.

### Initialization modes

First-time `init` prompts only for missing values:

```text
team-ai init                                             # Marketplace + Role prompts
team-ai init --marketplace <source>                      # Role prompt
team-ai init --role api                                  # Marketplace prompt
team-ai init --marketplace <source> --role api           # no prompts
```

Non-TTY mode never prompts. Missing Marketplace or Role values return an actionable error that tells automation to provide both flags.

### Backend and state

Native Copilot is preferred whenever `copilot` can be invoked. The fallback is selected only when Copilot CLI is unavailable and VS Code (`code`) is available.

Fallback materialization and metadata targets are:

```text
~/.copilot/installed-plugins/<marketplace>/<plugin>
~/.copilot/config.json
~/.copilot/settings.json
```

Fallback rules:

- merge, do not replace, Copilot config/settings;
- keep `settings.json.enabledPlugins` as effective enablement authority;
- mirror the effective flag into `config.json.installedPlugins`;
- preserve unknown fields and existing `source_sha` values;
- do not calculate a synthetic `source_sha` for newly materialized rows;
- use locking and atomic writes.

Marketplace registration uses Copilot `extraKnownMarketplaces` and also updates VS Code User Settings `chat.plugins.marketplaces`. VS Code settings are parsed as JSONC and the configured source is inserted or moved to array index `0`, preserving comments, trailing commas, unknown fields, and unrelated sources.

## 3. Implemented work items

All frozen-delta implementation items are complete in the current branch:

- [x] Config schema uses version `1` and `marketplace.source`.
- [x] Catalog loader reads `.github/plugin/marketplace.json` and discovers plugin kind from `com.company.teamai` metadata.
- [x] Role resolution uses bare names exposed by `kind: role` entries.
- [x] Namespace contract is centralized in `TEAM_AI_EXTENSION_NAMESPACE`.
- [x] Native Copilot adapter uses the plural `copilot plugins ...` command family.
- [x] Backend resolution prefers Copilot and falls back to VS Code-only materialization.
- [x] Fallback copies managed plugin directories into `~/.copilot/installed-plugins`.
- [x] Fallback merges Copilot config/settings and preserves unknown fields and `source_sha`.
- [x] Common plus all Roles are installed; Common plus exactly one Role is enabled.
- [x] `init` implements all four prompt/flag combinations and explicit non-TTY errors.
- [x] VS Code Marketplace registration is JSONC-safe and front-inserting.
- [x] Product validation and repository settings merge remain repo-native.
- [x] Project identity and machine partitions remain Git-native.
- [x] `managedPlugins` remains the ownership boundary.
- [x] Dry-run, status, doctor, sync, and role convergence cover both backends.
- [x] Native and fallback real Windows E2E scripts are checked in.

## 4. Current implementation map

```text
src/config/schema.ts       config version and validation
src/config/global.ts       ~/.team-ai/config.yaml read/write
src/copilot/catalog.ts     Marketplace and metadata-defined catalog
src/copilot/cli.ts         native Copilot adapter
src/copilot/fallback.ts    VS Code-only materializer
src/copilot/user-state.ts  fallback Copilot metadata merge and ownership state
src/copilot/vscode-settings.ts
                            JSONC-safe VS Code Marketplace registration
src/copilot/project-settings.ts
                            Product declaration merge
src/copilot/plugins.ts     desired state and managed ownership convergence
src/commands/init.ts       onboarding and first-time setup
src/commands/role.ts       role listing and switching
src/commands/sync.ts       convergence/repair
src/commands/status.ts     read-only state summary
src/commands/doctor.ts     diagnostics
```

## 5. Product and Project rules

Product remains a real shared capability declared from a business repository. The current `--product` path validates the requested `product-*` plugin in the configured catalog before writing:

```text
.github/copilot/settings.json
```

Only relevant `extraKnownMarketplaces` and `enabledPlugins` entries are changed; unrelated repository settings remain intact.

Project remains the real Git repository and is not a Plugin type. Skills, Agents, Instructions, Hooks, and other project customization stay under `.github/*`. The machine partition remains:

```text
~/.team-ai/projects/<safe-anchor>-<hash>/
  anchor
  state.json
```

## 6. Ownership and safety rules

`managedPlugins` records explicit Team AI ownership. Convergence may install, enable, disable, update, or repair only those plugins. A pre-existing user-owned or third-party plugin is not claimed from its name, and its enabled/version state is preserved.

All Copilot and VS Code settings operations are read-modify-write operations. Unknown native fields, unrelated Marketplaces, unrelated plugins, comments, and trailing commas are preserved where the format supports them. Dry-run must not mutate Copilot, VS Code, repository, or machine state.

## 7. Validation plan and current status

Run from this repository after building:

```text
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npm run test:e2e:copilot
npm run test:e2e:fallback
npm test
```

Current branch evidence is recorded in [`HANDOFF.md`](HANDOFF.md):

```text
typecheck        PASS
unit             PASS
integration      PASS
build            PASS
native E2E       PASS on Windows
fallback E2E     PASS on Windows
```

The native E2E uses the installed Copilot CLI and isolated temporary user/repository state. The fallback E2E hides Copilot CLI from PATH, supplies a VS Code-compatible `code`, verifies filesystem materialization and merged metadata, and checks recognition with the real Copilot CLI. Neither script relies on a fake Copilot implementation for its real-E2E claim.

No macOS native or fallback E2E result is part of this branch's evidence.

## 8. Deliberate non-goals

Keep the following out of the implementation until a concrete requirement, owner, and acceptance check exists:

- multiple-Marketplace selection, merge, overlay, or precedence;
- Marketplace package management or contribution automation;
- generic IDE/provider adapters;
- custom Plugin, Skill, Hook, or MCP formats;
- resource copying or injection;
- Hook/MCP execution by Team AI;
- telemetry, dashboards, TeamWiki, Recall, or Learning;
- a custom Product/Project database or session store.

YAGNI is part of the release gate: a new subsystem needs a real use case and evidence that the native Copilot/Repository boundary cannot cover it.
