# Team AI CLI

[中文](README.zh-CN.md) | English

`team-ai` is a thin, Copilot-native control layer for shared GitHub Copilot capabilities. It keeps Agent Plugin packages, the department Marketplace, and project-local `.github/*` customization in their native locations instead of introducing another runtime or plugin format.

The CLI is independent from any particular department Marketplace. Each user configures one Marketplace source; departments can maintain their own Marketplace while using the same CLI.

## Architecture

```text
                    team-ai CLI
              company-wide control plane
                         |
                         | init --marketplace <source>
                         v
              Department Marketplace
              .github/plugin/marketplace.json
                         |
                         | manifest.name + plugin metadata
                         v
              common@<marketplace>
              api@<marketplace>
              ios@<marketplace>
              aos@<marketplace>
              qa@<marketplace>
              design@<marketplace>

real business repository
  .github/copilot/settings.json
  .github/copilot-instructions.md
  .github/skills/
  .github/agents/
  .github/instructions/
  .github/hooks/
```

The CLI has no built-in department Marketplace. `teamai-vault/teamai-marketplace` is the reference/template Marketplace used by this workspace, not a CLI dependency.

## Requirements

- Node.js 20+
- Git
- Optional backend: GitHub Copilot CLI available as `copilot` (native backend), or VS Code available as `code` (fallback backend). Marketplace-managed user instructions are file-based and can converge without either backend; plugin convergence still requires one.

## Development installation

```text
npm install
npm run build
npm link
```

## Marketplace and plugin contract

`--marketplace` accepts a native Copilot source: a GitHub `owner/repo` reference, a ref-qualified reference, an HTTP(S)/SSH/git URL, or a local path. Relative local paths are normalized to absolute paths before they are persisted. The manifest name is discovered from the registered Marketplace; users do not provide it separately.

Plugin names are the names published by the Marketplace:

```text
common
api
ios
aos
qa
design
```

The plugin name does not encode its kind. The CLI reads the shared metadata namespace `com.company.teamai`:

```json
{
  "name": "api",
  "extensions": {
    "com.company.teamai": {
      "kind": "role"
    }
  }
}
```

`kind` is `common`, `role`, or `product`. If the namespace ever changes, update both `TEAM_AI_EXTENSION_NAMESPACE` in the CLI and the `extensions` namespace in every Marketplace `plugin.json`.

## Marketplace-managed user instructions

An optional Marketplace `user-instructions/` directory may contain native Copilot instruction files at any depth:

```text
user-instructions/**/*.instructions.md
```

`team-ai init` and `team-ai sync` mirror those files byte-for-byte into the managed user-level directory `~/.copilot/instructions/team-ai/`, preserving relative paths. The directory is Team AI-owned; keep personal instructions elsewhere under `~/.copilot/instructions/`. File and folder names only organize content—Team AI does not assign company, department, role, or action semantics, and native Copilot frontmatter remains unchanged.

This is the only narrow exception to the prohibition on arbitrary or generic resource copying/injection: the concrete use case is deploying department-approved Copilot user instructions. Marketplace maintainers own and review the content; Team AI owns only `~/.copilot/instructions/team-ai/` and mirrors the frozen `user-instructions/**/*.instructions.md` contract there. The CLI accepts regular single-link-count files, rejects link-like source/target paths and unsafe boundaries, writes atomically, and leaves all other user instructions untouched. This ownership and security boundary was reviewed with the frozen spec and implementation plan; no generic copier architecture is introduced.

If both Copilot CLI and VS Code are unavailable, `init`/`sync` still converge this file tree but return an error explaining that plugin convergence could not run; the command must not report full initialization or synchronization success.

## First-time initialization

The four first-time interactive combinations are:

```text
team-ai init                                             # prompt for Marketplace, then Role
team-ai init --marketplace <source>                      # prompt for Role
team-ai init --role api                                  # prompt for Marketplace
team-ai init --marketplace <source> --role api           # no prompts
```

In an interactive terminal, the role picker uses the roles exposed by the Marketplace and selects exactly one role. In a non-TTY environment (CI, redirected stdin, or another non-interactive shell), missing values are errors rather than prompts. Supply both values explicitly:

```text
team-ai init --marketplace <source> --role <role>
```

Initialization:

1. checks GitHub Copilot CLI and chooses the native backend when it is available;
2. loads the Marketplace and discovers its manifest name;
3. registers the source through native Copilot operations when needed;
4. installs `common` and every `kind: role` plugin in the catalog;
5. enables only `common` and the selected role;
6. stores the selected role, Marketplace identity, and explicit Team AI ownership;
7. optionally validates a Product plugin and declares it in the real repository settings.

Product plugins are not installed at user scope. The current Product path uses the existing `product-*` plugin names (for example `product-teamai`) and enables them through `.github/copilot/settings.json` only after catalog validation.

Example persisted config:

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

The config schema is version `1` and uses `marketplace.source` as its only source field. After initialization, normal commands use the saved Marketplace and refuse a different source instead of silently rebinding.

## Commands

```text
team-ai init [--marketplace <source>] [--role api|ios|aos|qa|design] [--product <name>]
team-ai sync
team-ai role list
team-ai role set <role>
team-ai status
team-ai doctor
```

All write commands support the global `--dry-run` option. A first-time dry run can inspect the supplied Marketplace and reports planned Marketplace/plugin/config/project changes without mutating state.

### `team-ai sync`

`sync` means convergence and repair. It installs missing Team AI-owned user plugins, restores enablement, refreshes Marketplace registration, updates VS Code Marketplace registration, and refreshes project machine state. It does not copy central Skills, Agents, Instructions, Hooks, or MCP definitions into the project, and it does not provide arbitrary or generic resource copying.

### `team-ai role`

```text
team-ai role list
team-ai role set qa
```

Changing role keeps all Team AI role plugins installed, enables `common` plus the new role, and disables the other Team AI-owned roles. A pre-existing user-owned plugin is preserved and is never claimed from its name alone.

### `team-ai status` and `team-ai doctor`

These commands inspect config, Marketplace/plugin state, native MCP metadata, VS Code registration, project settings, Git identity, and machine state. Hook declarations are validated as Marketplace content, but the CLI does not execute Hooks or pretend that unavailable runtime inspection succeeded.

## Native Copilot and VS Code-only fallback

When `copilot` is available, Team AI uses the native command family:

```text
copilot plugins marketplace add ...
copilot plugins marketplace list --json
copilot plugins marketplace browse <name> --json
copilot plugins install ...
copilot plugins enable ...
copilot plugins disable ...
copilot plugins update ...
```

When Copilot CLI is unavailable but `code` is available, Team AI uses a VS Code-compatible fallback. It reads the same Marketplace/plugin contract, materializes managed plugins into the Copilot-compatible location, and merges Copilot metadata:

```text
~/.copilot/installed-plugins/<marketplace>/<plugin>
~/.copilot/config.json
~/.copilot/settings.json
```

The fallback writes `installedPlugins` inventory and `enabledPlugins` state, while keeping `settings.json.enabledPlugins` as effective enablement authority and mirroring the inventory flag. Unknown fields and existing `source_sha` values are preserved; fallback-created rows do not calculate a synthetic `source_sha`.

## Copilot and VS Code Marketplace registration

User-level Copilot registration is represented by `extraKnownMarketplaces` in `~/.copilot/settings.json`. The real Copilot backend lets native Copilot own that update; the fallback merges only the configured Marketplace entry and preserves unknown/native fields.

Team AI also registers the source in VS Code User Settings under `chat.plugins.marketplaces`. The merge is JSONC-safe: comments, trailing commas, unknown settings, and existing entries are preserved, while the configured source is inserted or moved to index `0`.

Product declarations use the real repository file `.github/copilot/settings.json`. Team AI read-modify-writes only the relevant Marketplace/Product entries and preserves unrelated fields, marketplaces, and plugins.

## Ownership and project state

`managedPlugins` is the ownership boundary. Team AI may install, enable, disable, update, or repair only plugins it explicitly installed or claimed during convergence. User-owned and third-party plugin state remains untouched.

The real business Git repository is the Project scope. Project-specific Copilot customization stays in `.github/*`; Project is not a Plugin type. Machine state is partitioned by the stable Git project anchor:

```text
~/.team-ai/
  config.yaml
  projects/
    <safe-anchor>-<hash>/
      anchor
      state.json
```

## Marketplace rename utility

The checked-in `scripts/rename-marketplace.mjs` is a Marketplace maintainer utility. It changes the logical Marketplace ID inside the target Marketplace repository and does not modify the generic CLI or user-owned machine/project state.

```text
npm run rename:marketplace -- --from teamai --to payments-platform-ai --dry-run
npm run rename:marketplace -- --from teamai --to payments-platform-ai --display-name "Payments Platform AI"
```

See [`scripts/README.md`](scripts/README.md).

## Validation and tests

```text
npm run build
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e:copilot
npm run test:e2e:fallback
npm test
```

The two E2E scripts create isolated temporary profiles and repositories. `test:e2e:copilot` exercises native Copilot; `test:e2e:fallback` exercises the VS Code-only materializer and then checks native Copilot recognition of the materialized state. The latest branch evidence is recorded in [`docs/HANDOFF.md`](docs/HANDOFF.md).

## Non-goals

This project does not implement a default Marketplace, multiple-Marketplace merge/overlay/precedence, a package manager, another agent runtime, an IDE abstraction, custom Plugin/Skill/Hook/MCP formats, arbitrary or generic resource copying/injection (the only narrow exception is the frozen Marketplace-managed `user-instructions/**/*.instructions.md` contract described above), a generic overlay engine, telemetry, dashboards, TeamWiki/Recall/Learning, or a custom Product/Project database.

## Project documents

- [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md) — current frozen-delta implementation plan and status.
- [`docs/HANDOFF.md`](docs/HANDOFF.md) — current implementation state and validation evidence.
- [`docs/VERSIONING.md`](docs/VERSIONING.md) — CLI, Marketplace, and Plugin release/version rules.
- [`docs/codex-first-review.md`](docs/codex-first-review.md) — implementation review findings and dispositions.
