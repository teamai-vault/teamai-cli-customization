# Team AI Execution MVP — Implementation Plan

> Status: materialized implementation plan for Step 3
> Source of truth: `docs/02-teamai-cli-customization-frozen-architecture.md` from the original design workspace
> Execution prompt: `docs/03-teamai-cli-customization-implementation-prompt.md` from the original design workspace

This file records the implementation plan that was required before coding. It intentionally separates **planned scope** from the current execution status; the latter is maintained in [`HANDOFF.md`](HANDOFF.md).

## 1. Goal

Build a minimal Team AI Execution layer that is:

- Copilot-native;
- Git-native;
- based on Agent Plugins 1.0 and Copilot Plugin Marketplace;
- project-native for `.github/*` customization;
- a thin CLI rather than a new runtime;
- first-class on Windows and compatible with macOS/POSIX paths;
- deliberately constrained by YAGNI.

The CLI is company-wide and department-neutral. It must not be intrinsically bound to one Marketplace repository or Marketplace ID. Each user configures exactly one department-owned Marketplace for the current MVP.

The CLI must orchestrate native Copilot capabilities. It must not become a Plugin Manager, Skill copier, IDE adapter, generic overlay engine, or knowledge runtime.

## 2. Repository architecture

### `teamai-marketplace`

This repository is the reference/template Marketplace used to exercise and demonstrate the CLI. Departments may clone/derive it and maintain their own Marketplace without forking the CLI.

```text
teamai-marketplace/
├── .github/
│   └── plugin/
│       └── marketplace.json
├── plugins/
│   ├── common/
│   ├── role-api/
│   ├── role-ios/
│   ├── role-aos/
│   ├── role-qa/
│   ├── role-design/
│   └── product-*            # only when a real use case exists
├── docs/
├── scripts/
└── test/
```

Each plugin is an Agent Plugins 1.0 package with a root `plugin.json`. Portable capabilities use native locations such as `skills/`; Copilot-specific resources use `com.github.copilot/*`.

The marketplace contains only a small number of explicitly marked examples. Empty directories are not created merely to make the tree look complete; `.gitkeep` placeholders are allowed when they intentionally communicate a supported native extension location.

### `teamai-cli-customization`

```text
teamai-cli-customization/
├── README.md
├── README.zh-CN.md
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── docs/
│   ├── IMPLEMENTATION-PLAN.md
│   └── HANDOFF.md
├── src/
│   ├── cli.ts
│   ├── commands/
│   ├── config/
│   ├── copilot/
│   ├── project/
│   └── utils/
└── test/
    ├── unit/
    ├── integration/
    └── helpers/
```

## 3. Technology stack

### Runtime

- Node.js 20+
- TypeScript
- ESM

### Main dependencies

- `cross-spawn` — cross-platform subprocess invocation without POSIX shell assumptions.
- `yaml` — machine-local `~/.team-ai/config.yaml`.

### Test stack

- Vitest for CLI unit/integration tests.
- Node built-in test runner for Marketplace structural validation.
- Real temporary Git repositories/worktrees for project identity integration tests.
- Fake Copilot executable for deterministic integration coverage.
- Real installed Copilot CLI for release/E2E validation.

## 4. MVP command surface

```text
team-ai init [--marketplace <source>] [--role api|ios|aos|qa|design] [--product <name>]
team-ai sync
team-ai role list
team-ai role set <role>
team-ai status
team-ai doctor
```

Global write preview:

```text
--dry-run
```

## 5. Capability ownership model

```text
Common  -> common@<configured-marketplace> user plugin
Role    -> role-<role>@<configured-marketplace> user plugin
Product -> repo-enabled product-* plugin
Project -> native .github/* in the real business repository
```

There is no four-layer override engine.

Central capabilities should use unique names. A central name collision is a packaging/configuration error. Project-local precedence remains Copilot's responsibility.

## 6. CLI responsibilities

### Bootstrap

- verify GitHub Copilot CLI;
- on first init, require an explicit `--marketplace <source>`;
- register that source with native Copilot commands;
- discover the Marketplace registration key from Copilot after registration instead of asking the user to duplicate manifest `name`;
- persist Marketplace `name` + `source` in machine config;
- install/enable Common + Role capabilities;
- store only Team AI-owned local state.

There is no built-in default Marketplace. Full Git URLs, GitHub `owner/repo`, SSH/git URLs, and local paths are delegated to the native Copilot source contract. Local relative paths are normalized to absolute paths before persistence.

The MVP intentionally supports one configured Marketplace per user. It does not implement Marketplace list/add/use, multi-Marketplace merge, overlay, or precedence.

### Role selection

- persist selected role;
- converge new role;
- disable only a previous Team AI-owned role plugin;
- never silently claim a pre-existing user-managed plugin.

### Project onboarding

- detect real Git repository;
- resolve `workspaceRoot` and stable `projectAnchor`;
- inspect `.github/copilot/settings.json`;
- read-modify-write only owned keys;
- preserve unknown fields;
- validate Product Plugin existence before declaring it;
- keep project-specific customization in `.github/*`.

### Sync

`sync` means converge/repair, not resource copy. It reconciles native Copilot state and refreshes machine state.

### Status / doctor

- read-only status;
- actionable diagnostics;
- marketplace/plugin checks;
- repository settings validation;
- machine partition diagnostics;
- stale/orphan partition detection.

## 7. Machine-local state

```text
~/.team-ai/
├── config.yaml
└── projects/
    └── <safe-anchor>-<hash>/
        ├── anchor
        └── state.json
```

Current global config schema:

```yaml
version: 2
marketplace:
  name: <manifest-derived-name>
  source: <copilot-marketplace-source>
role: <role>
managedPlugins: []
```

Legacy v1 `marketplace.repository` is accepted and migrated in memory to v2 `marketplace.source`.

### Identity

```text
workspaceRoot = current git checkout/worktree
projectAnchor = stable main-worktree identity
```

The partition slug is based on normalized full anchor path plus a truncated SHA-256 hash.

### Safety

- atomic writes;
- per-partition exclusive lock;
- anchor collision check;
- no secrets;
- no telemetry;
- no session logs;
- no search indexes;
- no Team Repo clone.

## 8. Copilot repository settings

The CLI may read-modify-write:

```text
.github/copilot/settings.json
```

MVP-owned concerns:

```text
extraKnownMarketplaces
enabledPlugins
```

Rules:

- preserve unknown fields;
- preserve unrelated marketplaces/plugins;
- atomic write;
- preview with `--dry-run`;
- never introduce `.github/team-ai.yaml` unless a real Copilot capability gap is proven.

## 9. Implementation order

1. Marketplace manifest and minimal Agent Plugin packages.
2. Marketplace validator and structural tests.
3. CLI config/process/filesystem primitives.
4. Native Copilot adapter.
5. Common/Role desired-state and ownership rules.
6. Git repo/worktree identity and machine partition.
7. `init`, `role`, `status`, `doctor`.
8. Project settings merge and Product validation.
9. `sync` convergence/idempotence.
10. Fake-Copilot integration tests.
11. Real Copilot CLI E2E.
12. Implementation review and documentation.

## 10. Test strategy

### Unit

- YAML config read/write and validation;
- role validation/resolution;
- desired Common/Role plugins;
- settings JSON merge and unknown-field preservation;
- Windows/POSIX slug normalization;
- partition state and stale/orphan scan.

### Integration

- normal Git repository;
- nested cwd;
- real Git worktree;
- repeated `init`;
- first init requires explicit Marketplace source;
- Marketplace name discovery after native registration;
- full Git URL source persistence;
- local relative Marketplace path normalization;
- refuse silent Marketplace switching after initialization;
- v1 -> v2 config migration;
- repeated `sync`;
- role switch;
- `--dry-run` side-effect isolation;
- user-owned plugin preservation;
- local Marketplace live-plugin projections;
- Product Plugin declaration validation.

### Real E2E

Use an isolated temporary user profile and a real installed Copilot CLI to run:

```text
init --marketplace <source> --role design
role set api
sync
sync
status
doctor
```

Fake integration must never be described as real E2E.

## 11. Explicit non-goals

Not in the MVP:

- non-Copilot agent adapters;
- IDE adapters;
- custom Plugin/Skill/Hook/MCP formats;
- Skill/Agent/Hook/MCP copy/injection;
- generic overlay/patch/merge;
- tags;
- sources;
- package manager;
- default department Marketplace;
- multi-Marketplace selection/merge/overlay/precedence;
- contribution/publish automation;
- TeamWiki;
- Recall;
- Learning;
- telemetry/dashboard.

## 12. Feasibility and implementation risks

### Copilot CLI contract changes

Mitigation: isolate native command invocation in `src/copilot/cli.ts` and validate against an actually installed CLI, not only mocks.

### Marketplace/plugin ownership ambiguity

Mitigation: persist `managedPlugins`; only Team AI-owned plugins may later be toggled by Team AI. Special-case native local Marketplace `live-marketplace:<name>` disabled projections as catalog entries that may be explicitly claimed by `install`.

### Repository settings damage

Mitigation: minimal read-modify-write plus atomic replacement and preservation tests.

### Hook/MCP execution risk

Mitigation: MVP does not inject or execute them independently. Future Hook/MCP work must remain native Agent Plugin content and gain trust/source validation before broad rollout.

## 13. Design-deviation policy

If real Copilot behavior contradicts the frozen architecture, record:

```text
DESIGN DEVIATION

Original design:
Observed issue:
Evidence:
Minimal change:
YAGNI impact:
```

Do not silently redesign the architecture.

The current implementation required a **Copilot command-contract correction**, but no architecture-level deviation: the real Copilot CLI uses the newer plural `copilot plugins ...` machine-readable interface for JSON inspection. This still satisfies the frozen requirement to use native Copilot mechanisms.
