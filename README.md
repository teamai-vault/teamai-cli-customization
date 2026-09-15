# Team AI CLI

[中文](README.zh-CN.md) | English

`team-ai` is a thin, Copilot-native control layer for standardizing shared GitHub Copilot capabilities without introducing a second agent runtime or a custom plugin format.

The CLI is intentionally **independent from any specific department Marketplace**. One company-wide CLI can be used by different departments, while each department owns and maintains its own Copilot Marketplace.

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
                         | manifest.name
                         v
              common@<marketplace>
              role-<role>@<marketplace>
              product-*@<marketplace>

real business repository
  .github/copilot/settings.json
  .github/copilot-instructions.md
  .github/skills/
  .github/agents/
  .github/instructions/
  .github/hooks/
```

The CLI does not contain a default department Marketplace. `teamai-vault/teamai-marketplace` is a reference/template Marketplace, not a built-in dependency of the CLI.

## Requirements

- Node.js 20+
- Git
- GitHub Copilot CLI available as `copilot`

## Development installation

```text
npm install
npm run build
npm link
```

## First-time initialization

First-time initialization requires an explicit Marketplace source:

```powershell
team-ai init `
  --marketplace https://github.com/example-org/department-ai-marketplace.git `
  --role api
```

`--marketplace` is passed to the native Copilot Marketplace registration command. GitHub Copilot CLI `1.0.83` accepts:

```text
owner/repo
owner/repo#ref
https://...
ssh://...
git@host:owner/repo.git
local paths
```

Full Git URLs are supported and are a good default for internal documentation.

The user does **not** provide the Marketplace name separately. The CLI registers the source through Copilot, detects the registration key derived from `.github/plugin/marketplace.json`, and persists both values.

Example persisted config:

```yaml
version: 2
marketplace:
  name: payments-ai
  source: https://github.com/example-org/payments-ai-marketplace.git
role: api
managedPlugins:
  - common@payments-ai
  - role-api@payments-ai
```

After first-time initialization, normal commands use the persisted Marketplace and do not require `--marketplace` again.

If `--marketplace` is supplied later with a different source, `init` refuses to silently switch Marketplace. Marketplace migration is intentionally outside the current MVP.

Local relative paths are resolved to absolute paths before being persisted so later commands do not depend on the current working directory.

## Commands

```text
team-ai init [--marketplace <source>] [--role api|ios|aos|qa|design] [--product <name>]
team-ai sync
team-ai role list
team-ai role set <role>
team-ai status
team-ai doctor
```

All write commands support global `--dry-run`.

For first-time `--dry-run`, an unregistered remote Marketplace cannot reveal its manifest-derived name without registration. In that case the CLI truthfully previews the Marketplace add and skips plugin/config/project previews rather than mutating Copilot.

### `team-ai init`

First-time init:

```text
team-ai init --marketplace <source> --role <role>
```

It:

1. verifies the Copilot CLI;
2. registers the supplied Marketplace source through native Copilot commands;
3. discovers the Marketplace registration key from Copilot;
4. converges `common@<marketplace>` plus the selected `role-*` plugin;
5. persists Marketplace source/name, role, and Team AI-owned plugins in `~/.team-ai/config.yaml`;
6. optionally validates and declares a `product-*` plugin through repository settings.

It does not copy central Skills, Agents, Hooks, or MCP definitions into the project.

### `team-ai sync`

`sync` means converge/repair, not resource copying. It reconciles Team AI-owned plugins through the native Copilot plugin manager and refreshes machine state.

### `team-ai role`

```text
team-ai role list
team-ai role set design
```

Changing role disables only a previous role plugin that Team AI itself owns. A pre-existing user-installed plugin is never silently claimed.

### `team-ai status` / `team-ai doctor`

These inspect the configured Marketplace, plugin state, Copilot-native MCP metadata, project settings, Git project identity, and machine state. Hook declarations are supported by Marketplace validation; Copilot CLI `1.0.83` does not expose installed Hooks through structured inspection. Team AI never starts MCP servers or executes Hooks during diagnostics, and it does not select or merge multiple Marketplaces.

## Configuration compatibility

Current config schema is version `2` and uses `marketplace.source`.

Legacy version `1` configs using:

```yaml
marketplace:
  repository: <source>
```

are accepted and migrated in memory to version `2`. The next normal config write persists the new shape.

## Project model

The real business Git repository is the project scope. Project-specific Copilot customization stays with the code under `.github/*`.

`team-ai init --product payments` validates `product-payments` against the configured Marketplace and read-modify-writes `.github/copilot/settings.json`, preserving unknown fields, unrelated marketplaces, and unrelated plugins.

## Machine state and Git worktrees

```text
~/.team-ai/
  config.yaml
  projects/
    <safe-anchor>-<hash>/
      anchor
      state.json
```

`workspaceRoot` is the current checkout/worktree. `projectAnchor` is the stable main-worktree identity used for partitioning.

## Reference Marketplace and department templates

`teamai-vault/teamai-marketplace` is maintained as a reference/template Marketplace. A department can clone or derive from that repository, choose its own manifest `name`, maintain its own Common/Role/Product capabilities, and use the same company-wide CLI:

```powershell
team-ai init `
  --marketplace https://github.com/example-org/mobile-ai-marketplace.git `
  --role ios
```

No CLI fork is required.

## Marketplace rename utility

The checked-in `scripts/rename-marketplace.mjs` is a **Marketplace maintainer utility**. It renames the logical Marketplace ID inside a Marketplace repository; it does not rename or modify the generic CLI.

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
npm test
```

Integration tests use a fake Copilot executable plus real temporary Git repositories/worktrees. They are deliberately labeled integration tests, not real Copilot E2E.

After `npm run build`, `npm run test:e2e:copilot` uses the installed real Copilot CLI with an isolated temporary profile and Git repository to validate explicit Marketplace initialization, `--product teamai`, and `doctor` against the sibling Marketplace checkout.

Real Copilot CLI behavior should also be exercised before releases. See [`docs/HANDOFF.md`](docs/HANDOFF.md) for the latest validation state.

## Non-goals

This project does not currently implement:

- a default department Marketplace;
- multi-Marketplace selection/merge/overlay/precedence;
- a Marketplace package manager;
- non-Copilot agent runtimes or IDE adapters;
- custom Plugin/Skill/Hook/MCP formats;
- a generic overlay engine;
- TeamWiki, Recall, Learning, telemetry, or dashboards.

## Project documents

- [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md) — implementation plan derived from the frozen architecture.
- [`docs/HANDOFF.md`](docs/HANDOFF.md) — current implementation state, validation evidence, remaining issues, and next priorities.
- [`docs/VERSIONING.md`](docs/VERSIONING.md) — CLI, Marketplace, and Plugin release/version rules.
- [`docs/codex-first-review.md`](docs/codex-first-review.md) — consolidated implementation review findings and dispositions.
