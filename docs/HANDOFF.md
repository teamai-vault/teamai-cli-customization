# Team AI Execution MVP — Handoff

> Updated: 2026-09-15
> Repositories: `teamai-vault/teamai-cli-customization`, `teamai-vault/teamai-marketplace`
> Current phase: v0.1 MVP implemented; production hardening and team rollout next

## 1. Current architecture

The project remains aligned with the frozen design:

```text
Shared capabilities
  -> Agent Plugins 1.0
  -> teamai-marketplace
  -> native GitHub Copilot Marketplace

Common
  -> common@teamai

Role
  -> role-api / role-ios / role-aos / role-qa / role-design

Product
  -> future product-* plugin
  -> declared by real repository settings

Project
  -> real business repository .github/*

Machine state
  -> ~/.team-ai/

team-ai CLI
  -> bootstrap + role + convergence + status + doctor
```

No custom runtime, IDE adapter, overlay engine, or knowledge runtime has been introduced.

## 2. Implemented repositories

### `teamai-marketplace`

Current canonical manifest:

```text
.github/plugin/marketplace.json
```

Current plugins:

```text
common
role-api
role-ios
role-aos
role-qa
role-design
```

`common` and `role-api` contain small, explicitly marked example capabilities. `role-design` contains deliberate `.gitkeep` placeholders for native Plugin extension locations.

There is intentionally no fake Product Plugin yet. Add `product-*` only when at least one real cross-repository Product capability exists.

### `teamai-cli-customization`

Implemented commands:

```text
team-ai init
team-ai sync
team-ai role list
team-ai role set <role>
team-ai status
team-ai doctor
```

Roles:

```text
api
ios
aos
qa
design
```

All write commands support `--dry-run`.

## 3. Important real Copilot CLI findings

These findings came from GitHub Copilot CLI `1.0.83` on Windows and should be preserved because they affect future maintenance.

### 3.0 Marketplace identity was normalized to `teamai`

The early architecture draft used `company-ai` as a generic placeholder marketplace name. Before team rollout, the real Marketplace identity was intentionally normalized to:

```text
teamai
```

The canonical GitHub repository remains:

```text
teamai-vault/teamai-marketplace
```

Do not reintroduce `company-ai`, `Company AI`, or example organization identifiers such as `acme/*` into production defaults or documentation. Test-only repository identities should be explicitly named `test-org/*`.

### 3.1 Marketplace manifest locations

Both of these layouts were tested with a real local Marketplace and succeeded with `marketplace add` + `browse`:

```text
marketplace.json
```

and:

```text
.github/plugin/marketplace.json
```

The repository now deliberately uses `.github/plugin/marketplace.json` because that matches the Marketplace creation-guide layout. Root-level support is real compatibility evidence, not the selected convention.

### 3.2 Use `copilot plugins`, not old assumptions about `copilot plugin --json`

The singular command family does not expose the JSON options that the first implementation assumed:

```text
copilot plugin marketplace list --json
copilot plugin list --json
```

Both return `unknown option '--json'` on 1.0.83.

The current machine-readable interface is the plural command family:

```text
copilot plugins marketplace list --json
copilot plugins marketplace browse <name> --json
copilot plugins list --kind plugin --json
```

Mutation operations are also implemented through:

```text
copilot plugins marketplace add ...
copilot plugins install ...
copilot plugins enable ...
copilot plugins disable ...
copilot plugins update ...
```

Keep this command contract covered by real E2E because Copilot CLI is evolving rapidly.

### 3.3 Local Marketplace plugins are live projections

After adding a local Marketplace, `copilot plugins list --kind plugin --json` exposes every catalog plugin, even before explicit installation:

```json
{
  "source": "live-marketplace:teamai",
  "enabled": false
}
```

Installing a plugin enables that live projection; files remain live in the Marketplace checkout and are not copied.

The CLI therefore treats a disabled `live-marketplace:<marketplace>` row as an available catalog projection that Team AI can claim by explicitly installing it. It does **not** apply this rule to ordinary pre-existing disabled user plugins.

This distinction is important for ownership safety.

## 4. Plugin ownership rule

`~/.team-ai/config.yaml` records `managedPlugins`.

Only plugins that Team AI installed/claimed are later eligible for Team AI enable/update/disable operations.

Example:

```yaml
managedPlugins:
  - common@teamai
  - role-api@teamai
```

If `role-api@teamai` already exists as a normal user-owned plugin before Team AI initialization, Team AI preserves its enabled/version state and emits a warning instead of taking ownership.

## 5. Project and worktree behavior

Project scope is the real Git repository.

```text
workspaceRoot = current checkout/worktree
projectAnchor = stable main-worktree identity
```

Machine state:

```text
~/.team-ai/projects/<safe-anchor>-<hash>/
  anchor
  state.json
```

The code covers normal repositories, nested cwd, Windows paths, POSIX paths, and real Git worktrees.

`doctor` also reports stale/orphan Team AI partitions but does not delete them automatically.

## 6. Repository settings behavior

Product Plugin declarations use native:

```text
.github/copilot/settings.json
```

Team AI owns only the relevant entries under:

```text
extraKnownMarketplaces
enabledPlugins
```

Writes are read-modify-write and atomic. Unknown fields and unrelated user plugins/marketplaces are preserved.

`init --product <name>` refuses to write the declaration unless the Product Plugin exists in the configured Marketplace catalog.

## 7. Validation status

### CLI automated validation

Last full run:

```text
npm run build     PASS
npm run typecheck PASS
npm test          PASS
```

Test result:

```text
7 test files passed
17 tests passed
```

Coverage includes:

- config read/write;
- role validation including `design`;
- settings merge and unknown-field preservation;
- Windows and POSIX path partitioning;
- normal repo / nested cwd / real worktree;
- repeated `init`;
- role switching;
- repeated `sync` idempotence;
- `status` / `doctor`;
- `--dry-run`;
- user-owned plugin preservation;
- local Marketplace live-plugin projection ownership;
- Product Plugin validation.

### Marketplace validation

```text
npm run validate PASS
npm test         PASS
```

The real Copilot CLI successfully registered and browsed the guide-layout Marketplace and returned all six plugins.

### Real Copilot E2E

Executed with:

```text
GitHub Copilot CLI 1.0.83
Windows
isolated temporary USERPROFILE/HOME
isolated temporary Git repository
local Marketplace checkout
```

Sequence:

```text
team-ai init --role design  PASS
team-ai role set api        PASS
team-ai sync                PASS
team-ai sync                PASS (no-op)
team-ai status              PASS
team-ai doctor              PASS, exit 0
```

Observed final native state:

```text
common@teamai   enabled
role-api@teamai enabled
role-design@teamai disabled after role switch
other role plugins disabled live Marketplace projections
```

The temporary profile/repository was removed after the test.

After the Marketplace identity was renamed from the early placeholder `company-ai` to `teamai`, the same CLI flow was re-run against the **pushed GitHub Marketplace source** with no `TEAM_AI_MARKETPLACE_SOURCE` override. This exercised the default `teamai-vault/teamai-marketplace` path and the final `teamai` identity end-to-end:

```text
team-ai init --role design  PASS
team-ai role set api        PASS
team-ai sync                PASS (no-op after convergence)
team-ai doctor              PASS, exit 0
```

Final remote-backed native state:

```text
common@teamai      enabled, source=marketplace:teamai
role-api@teamai    enabled, source=marketplace:teamai
role-design@teamai disabled after role switch
```

The remote E2E also used an isolated temporary profile/repository and cleaned the temporary directory afterward.

## 8. Known limitations / remaining issues

### 8.1 Remote GitHub Marketplace E2E

Completed against the pushed GitHub repository:

```text
copilot plugins marketplace add teamai-vault/teamai-marketplace
copilot plugins marketplace browse teamai
copilot plugins install common@teamai
copilot plugins install role-design@teamai
```

All commands succeeded. Remote installed plugin rows use:

```text
source: marketplace:teamai
```

which is supported by the current CLI adapter.

During the earlier pre-rename Windows validation, individual plugin removal returned `os error 5` (access denied), while the documented forced Marketplace cleanup path succeeded. This appeared to be a Copilot CLI/filesystem behavior rather than an identifier-specific issue. The post-rename E2E used an isolated profile and removed the temporary profile instead of claiming that this cleanup edge case was re-tested.

The successful cleanup path observed in that earlier validation was:

```text
copilot plugins marketplace remove teamai --force
```

After the forced removal, `teamai` was absent and `copilot plugins list --kind plugin --json` returned no remaining test plugins.

### 8.2 Marketplace catalog JSON does not currently expose versions

On Copilot CLI 1.0.83, `copilot plugins marketplace browse <name> --json` returns names/descriptions but not plugin versions.

The CLI therefore cannot reliably decide from that structured endpoint whether a managed remote plugin is outdated. Do not invent a scraper or private API solely for this.

Possible future approaches:

1. rely on native Copilot update/auto-update semantics;
2. add an explicit Team AI update action only when a concrete need appears;
3. use a future Copilot structured version field if GitHub adds one.

### 8.3 macOS runtime E2E

POSIX path behavior is unit-tested, but an actual macOS machine should run the same real Copilot E2E before declaring cross-platform release readiness.

### 8.4 CI

There is no GitHub Actions pipeline yet. Add Windows + macOS CI before broad team rollout.

### 8.5 Agent Plugin schema validation

The Marketplace validator checks the key local structural contracts. It is not yet a full official-schema validation engine. Prefer adopting an official validator/schema tool if GitHub/Agent Plugins provides a stable one rather than maintaining a large custom schema implementation.

## 9. Deferred work — implementation priority

The following priority deliberately separates **native capability expansion** from **new Team AI subsystems**.

### P0 — Production hardening before broad rollout

1. Windows + macOS CI for build/typecheck/tests.
2. Real CLI contract smoke test against the supported Copilot CLI version(s).
3. Decide release/versioning policy for Marketplace Plugin versions and CLI version.
4. Replace example capabilities with reviewed team content only when owners are identified.

P0 should happen before adding major new feature families.

### P1 — Native MCP and Hook capabilities, with governance first

#### P1.1 Shared MCP

Implement when there is a real internal MCP use case.

Preferred design:

```text
Agent Plugin native MCP definition
        |
        v
Copilot native loading/trust
```

Do **not** add a Team AI MCP converter/injector.

Before rollout, extend validation/doctor for:

- declared executable/source visibility;
- obvious invalid command/path diagnostics;
- documentation of required credentials without storing secrets;
- trust/governance warnings.

Why before Hooks: an MCP gives high reusable value while usually having a clearer explicit tool boundary than automatically firing Hooks.

#### P1.2 Shared Hooks

Use native:

```text
com.github.copilot/hooks/
```

Do not build a Hook injector.

Because Hooks may execute commands automatically, first add governance checks:

- hook source is inside the trusted Plugin;
- command/script path is reviewable;
- no hidden remote install/execute behavior;
- clear lifecycle/event documentation;
- security review for any shell/process execution.

Only then add the first real Hook use case.

#### P1.3 First real Product Plugin

Add only when a real Product has capabilities shared by multiple code repositories. Do not add `product-*` as a template-only shell.

### P2 — Contribution / publish workflow

Add the collaboration loop once the Marketplace has enough real content that manual contribution becomes friction:

```text
local capability
  -> validate
  -> branch in teamai-marketplace
  -> PR
  -> review
  -> merge
```

Potential command:

```text
team-ai contribute <path>
```

or:

```text
team-ai publish <path>
```

Keep Git/PR review as the source of truth. Do not create a proprietary package registry.

### P3 — Knowledge Recall integration

Knowledge remains a separate plane:

```text
Copilot
  -> wiki-recall Skill / MCP
  -> LLM Wiki Runtime
  -> Team LLM Wiki
```

The Team AI CLI should not absorb BM25/vector/hybrid retrieval, indexing, or TeamWiki.

At this phase, add only the smallest shared Skill/MCP needed to invoke the independent Wiki Runtime.

### P4 — Learning

Learning comes **after** shared capabilities, contribution governance, and Knowledge Recall are stable.

Reason:

- session-derived learning is noisy;
- it raises privacy/governance questions;
- it can easily create low-quality knowledge churn;
- it overlaps the separate knowledge plane;
- there is currently no need to reproduce Tencent TeamAI's full Learning/Recall loop.

Recommended future flow:

```text
session friction signal
  -> candidate learning
  -> human/agent review
  -> PR to canonical Wiki or Marketplace Skill
```

Do not dump raw sessions into search/index storage.

### P5 — Keep deferred until a concrete need exists

Lowest current priority:

- tags;
- cross-team source subscriptions;
- package manager;
- generic overlay/patch/merge;
- IDE adapters;
- multi-agent adapters;
- telemetry;
- dashboard;
- TeamWiki clone;
- custom learning database.

These should require a new design justification, not be added by default.

## 10. Recommended next implementation sequence

```text
1. Add CI: Windows + macOS
2. Replace/extend example Common/API content with reviewed real capabilities
3. Select one real shared MCP use case
4. Add MCP validation/governance + native MCP definition
5. Select one real Hook use case
6. Add Hook governance + native Hook
7. Add contribution/publish PR workflow when manual contribution becomes painful
8. Integrate LLM Wiki Runtime through a small Skill/MCP
9. Revisit Learning only after the above is stable
```

## 11. Rules for the next agent

1. Read this handoff and `IMPLEMENTATION-PLAN.md` first.
2. Preserve Copilot-native and Git-native boundaries.
3. Test against a real Copilot CLI whenever changing `src/copilot/cli.ts`.
4. Never infer CLI JSON flags from fake tests; inspect real `--help` and run a smoke test.
5. Preserve user-owned plugin state.
6. Keep Product/Project distinction: Product = shared plugin, Project = real repo `.github/*`.
7. Do not add a custom Hook/MCP injector.
8. Do not move Knowledge Runtime into this CLI.
9. Do not claim fake integration as real E2E.
10. Prefer a truthful RED over invented success.
