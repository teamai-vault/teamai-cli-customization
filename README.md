# Team AI CLI

[中文](README.zh-CN.md) | English

`team-ai` is a thin, Copilot-native team control layer for standardizing shared GitHub Copilot capabilities across a team without introducing a second agent runtime or a custom plugin format.

It manages **bootstrap, role selection, Copilot marketplace/plugin convergence, project onboarding, diagnostics, and machine-local state**. Shared capabilities remain standard Agent Plugins; project-specific customization remains in the business repository under `.github/*`.

## Architecture

```text
teamai-marketplace
  .github/plugin/marketplace.json
  plugins/
    common
    role-api
    role-ios
    role-aos
    role-qa
    role-design
    product-* (when a real use case exists)
             |
             | native Copilot marketplace/plugin commands
             v
GitHub Copilot CLI / VS Code / other Copilot surfaces
             ^
             |
real business repository
  .github/copilot/settings.json
  .github/copilot-instructions.md
  .github/skills/
  .github/agents/
  .github/instructions/
  .github/hooks/

team-ai CLI
  bootstrap + role + sync + status + doctor
  machine state -> ~/.team-ai/
```

The ownership model is intentionally small:

| Capability | Owner / location |
| --- | --- |
| Common | `common@teamai` user plugin |
| Role | `role-<role>@teamai` user plugin |
| Product | `product-*` plugin enabled by repository settings |
| Project | Native `.github/*` files in the real business repository |
| Machine state | `~/.team-ai/` |

## Requirements

- Node.js 20+
- Git
- GitHub Copilot CLI available as `copilot`

Verify Copilot first:

```text
copilot --version
```

## Development installation

```text
npm install
npm run build
npm link
```

After linking, `team-ai` should be available on `PATH`.

For local marketplace development, point first-time initialization at the marketplace checkout:

```powershell
$env:TEAM_AI_MARKETPLACE_SOURCE = "F:\path\to\teamai-marketplace"
team-ai init --role api
```

For normal team use, the default marketplace source is `teamai-vault/teamai-marketplace`.

## Renaming the Marketplace ID

The Copilot Marketplace ID is intentionally independent from the GitHub organization and repository names. If the final internal name needs to incorporate a department/team name, use the rename tool instead of doing manual search-and-replace:

```text
npm run rename:marketplace -- --from teamai --to payments-platform-ai --dry-run
npm run rename:marketplace -- --from teamai --to payments-platform-ai --display-name "Payments Platform AI"
```

The tool updates both sibling repositories, including the Marketplace manifest, CLI default ID, plugin specs such as `common@teamai`, Copilot source markers, tests, and documentation. It verifies that no standalone old Marketplace ID remains.

It deliberately does **not** rename repository/package identities such as:

```text
teamai-vault
teamai-marketplace
teamai-cli-customization
```

Optional path overrides are available when the repositories are not sibling directories:

```text
npm run rename:marketplace -- --to payments-platform-ai --cli-repo <path> --marketplace-repo <path>
```

Always run `--dry-run` first, then run the normal build/typecheck/tests and a real Copilot Marketplace smoke test after the rename.

The script updates these two source repositories only. If the old Marketplace ID has already been rolled out, also plan a runtime migration for:

- each developer machine's registered Copilot Marketplace and installed `*@<old-id>` plugins;
- `~/.team-ai/config.yaml` (`marketplace.name` and `managedPlugins`);
- business repositories that already declare the old ID in `.github/copilot/settings.json` (`extraKnownMarketplaces` and `enabledPlugins`).

Before broad team rollout, renaming is therefore cheap. After rollout, treat it as a small migration rather than only a source-code rename.

## Commands

```text
team-ai init [--role api|ios|aos|qa|design] [--product <name>]
team-ai sync
team-ai role list
team-ai role set <role>
team-ai status
team-ai doctor
```

All write commands support global `--dry-run`:

```text
team-ai --dry-run init --role api
team-ai --dry-run sync
team-ai --dry-run role set design
```

### `team-ai init`

First-time machine initialization:

```text
team-ai init --role api
```

It:

1. verifies the Copilot CLI;
2. registers the company marketplace through native `copilot plugins` commands;
3. converges `common@teamai` plus the selected `role-*` plugin;
4. stores the selected role and Team AI-owned plugins in `~/.team-ai/config.yaml`;
5. if inside a Git repository, detects the workspace and machine partition;
6. optionally validates and declares a `product-*` plugin via repository settings.

It does **not** copy central Skills, Agents, Hooks, or MCP definitions into the project.

### `team-ai sync`

`sync` means **converge/repair**, not a TeamAI-style resource copier. It reconciles the Team AI-owned common/role plugins through the native Copilot plugin manager and refreshes machine state.

### `team-ai role`

```text
team-ai role list
team-ai role set design
```

Changing role disables only a previous role plugin that Team AI itself owns. A pre-existing user-installed plugin is never silently claimed as Team AI-managed.

### `team-ai status`

Read-only summary of global role/plugin state, current Git project identity, product declarations, project-native Copilot customization, and the machine partition.

### `team-ai doctor`

Read-only diagnostics for Git, Copilot CLI, marketplace/plugin state, repository settings, product declarations, machine-state writability, and stale/orphan project partitions.

## Global configuration

Machine-local configuration lives at:

```text
~/.team-ai/config.yaml
```

Example:

```yaml
version: 1
marketplace:
  name: teamai
  repository: teamai-vault/teamai-marketplace
role: api
managedPlugins:
  - common@teamai
  - role-api@teamai
```

`managedPlugins` is an ownership boundary. `team-ai` only enables, updates, or disables plugins that it installed/owns.

## Project model

The real business Git repository is the project scope. Project-specific Copilot customization stays with the code:

```text
.github/
  copilot/
    settings.json
  copilot-instructions.md
  skills/
  agents/
  instructions/
  hooks/
```

`team-ai init --product payments` first checks that `product-payments` exists in the configured marketplace, then read-modify-writes `.github/copilot/settings.json`. Unknown fields, unrelated marketplaces, and unrelated plugins are preserved.

No `*-team-ai` sibling repository is created.

## Machine state and Git worktrees

Machine-only project state is stored outside business repositories:

```text
~/.team-ai/
  config.yaml
  projects/
    <safe-anchor>-<hash>/
      anchor
      state.json
```

`workspaceRoot` is the current checkout/worktree. `projectAnchor` is the stable main-worktree identity used for partitioning, so multiple Git worktrees share project identity without writing machine state into the repository.

Writes use atomic file replacement and per-partition lock files.

## Validation and tests

```text
npm run build
npm run typecheck
npm run test:unit
npm run test:integration
npm test
```

Integration tests use a fake Copilot executable plus real temporary Git repositories/worktrees. They are deliberately labeled integration tests, not real Copilot E2E.

Real Copilot CLI behavior should also be exercised before releases. See [`docs/HANDOFF.md`](docs/HANDOFF.md) for the latest validation state.

## Non-goals

This project does not currently:

- support non-Copilot agent runtimes or IDE adapters;
- replace the Copilot plugin manager or Copilot `/init`;
- define a custom Plugin, Skill, Hook, or MCP format;
- copy or transform central Skills/Agents/Hooks/MCP into projects;
- implement a generic overlay/patch/merge engine;
- implement TeamWiki, Recall, Learning, telemetry, or dashboards.

Future work and priorities are recorded in [`docs/HANDOFF.md`](docs/HANDOFF.md).

Marketplace identity changes should use [`scripts/rename-marketplace.mjs`](scripts/rename-marketplace.mjs). See [`scripts/README.md`](scripts/README.md) for the safe rename workflow and rollout migration boundary.

## Project documents

- [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md) — implementation plan derived from the frozen architecture.
- [`docs/HANDOFF.md`](docs/HANDOFF.md) — current implementation state, validation evidence, remaining issues, and next priorities.
