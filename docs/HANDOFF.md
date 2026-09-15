# Team AI Execution MVP — Handoff

> Updated: 2026-09-15
> Repositories: `teamai-vault/teamai-cli-customization`, `teamai-vault/teamai-marketplace`
> Current phase: P0 and P1.1-P1.3 capability support implemented and branch-CI validated

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
  -> product-teamai@teamai
  -> future product-* plugins only for real use cases
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

Current Marketplace catalog version: `0.2.0`.

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
product-teamai
```

`common` and `role-api` contain small, explicitly marked example capabilities. `role-design` contains deliberate `.gitkeep` placeholders for native Plugin extension locations.

`product-teamai` is the first real Product Plugin. Its `teamai-change-readiness` Skill applies the same cross-repository validation and release gate to the CLI and Marketplace repositories. Add another `product-*` only when another real cross-repository Product capability exists.

The Marketplace validator supports optional native root `mcp.json` and `com.github.copilot/hooks/hooks.json` declarations. This is capability-type support only: no published Plugin currently contains an MCP server or Hook implementation.

### `teamai-cli-customization`

Current CLI version: `0.1.1`.

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

`status` and `doctor` inspect MCP metadata through Copilot's native structured command. Hook declarations are validated in the Marketplace; the CLI does not execute either capability type.

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

The Marketplace ID may still be renamed later after the owning department/team agrees on a final internal name. Do not do a raw global replacement because `teamai` is also part of repository identities such as `teamai-vault`, `teamai-marketplace`, and `teamai-cli-customization`.

Use the checked-in rename tool instead:

```text
npm run rename:marketplace -- --from teamai --to <new-marketplace-id> --dry-run
npm run rename:marketplace -- --from teamai --to <new-marketplace-id> [--display-name "<display name>"]
```

The tool lives at `scripts/rename-marketplace.mjs`, updates both sibling repositories, performs boundary-aware replacement of Marketplace identity tokens, and fails if the old standalone ID would remain. Repository/package identifiers containing the same text as part of a larger hyphenated name are intentionally preserved.

The rename tool is intentionally source-repository scoped. Once an ID has been rolled out, a rename also requires migration of developer Copilot registrations/plugins, `~/.team-ai/config.yaml`, and any business repository `.github/copilot/settings.json` that declares the old Marketplace ID. Do not silently mutate those external/user-owned locations from the development rename script.

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

### 3.4 MCP inspection is structured; Hook inspection is not yet exposed

On Copilot CLI `1.0.83`, this command returns `{ "plugins": [...], "errors": [...] }` for configured MCP servers:

```text
copilot plugins list --kind mcp --json
```

A real isolated user-profile check confirmed a non-empty MCP row with `kind`, `name`, `scope`, `source`, `enabled`, and `description`. Listing metadata did not require Team AI to start the server.

The same CLI's `copilot plugins list --help` explicitly says custom agents and session-scoped Hooks are not covered because they require a live session. Team AI therefore validates Plugin Hook declarations statically and reports runtime inspection as unavailable instead of inventing an inspection mechanism.

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
8 test files passed
23 tests passed
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
- Product Plugin validation before Copilot mutation;
- user-owned Plugin warning consistency;
- empty Marketplace catalog Product diagnostics;
- native MCP structured discovery and error diagnostics;
- truthful Plugin Hook inspection limitations.

### Marketplace validation

```text
npm run validate PASS
npm test         PASS (10 tests)
npm run test:copilot PASS locally on Windows and in Windows/macOS branch CI
```

The validator also rejects lexical and symlink/junction Plugin source escapes, internal Plugin content links that escape their Plugin source, Skills without a frontmatter description, and unsafe native MCP/Hook declarations. Capability validation covers schema/shape, plugin-relative source visibility, path containment, cross-platform Hook commands, obvious remote download/execute behavior, HTTPS, and committed credential headers. The real Copilot CLI successfully registered and browsed the guide-layout Marketplace and returned all seven plugins, including `product-teamai`. The automated smoke also installed `common@teamai` and verified structured Plugin state through the plural command family.

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

The P1.3 Product path was also re-run on Windows against the local Marketplace checkout with a fresh isolated profile and Git repository:

```text
team-ai init --role api --product teamai PASS
team-ai doctor                            PASS, exit 0
```

The resulting native repository settings enabled `product-teamai@teamai` and declared the local Marketplace as a directory source. `scripts/smoke-team-ai.mjs` removed the temporary profile/repository in its `finally` path.

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

The Marketplace contract smoke ran against real Copilot CLI `1.0.83` on macOS GitHub Actions. The fuller `team-ai init --role api --product teamai` Product flow has passed locally on Windows, but has not yet run on a real macOS machine.

### 8.4 CI

Both repositories contain GitHub Actions workflows for Windows and macOS. The CLI runs install, typecheck, tests, and build. The Marketplace runs validation/tests plus a separate real Copilot CLI `1.0.83` contract smoke with isolated user state.

The branch workflows completed GREEN on both platforms. The latest P1.1/P1.2 runs are:

- CLI run `34925133160`: Windows and macOS build/typecheck/tests passed at CLI commit `dd50bed`.
- Marketplace run `34925105930`: Windows and macOS validation/tests and real Copilot contract smoke passed at Marketplace commit `32097cf`.

The first runs exposed a macOS canonical temp-path mismatch and a Windows shell-glob assumption. Both root causes were fixed and retained as portable tests/configuration.

### 8.5 Agent Plugin schema validation

The Marketplace validator checks the key local structural contracts. It is not yet a full official-schema validation engine. Prefer adopting an official validator/schema tool if GitHub/Agent Plugins provides a stable one rather than maintaining a large custom schema implementation.

### 8.6 Hook runtime inspection

Copilot CLI `1.0.83` does not expose installed/session Hook metadata through `copilot plugins list --json`. Team AI validates Marketplace declarations and counts repository Hook files, but cannot confirm live Hook loading without entering a trusted Copilot session. It does not execute Hooks as a workaround.

## 9. Deferred work — implementation priority

The following priority deliberately separates **native capability expansion** from **new Team AI subsystems**.

### P0 — Production hardening before broad rollout

1. Windows + macOS CI for build/typecheck/tests — implemented and GREEN on branch CI.
2. Real CLI contract smoke test against Copilot CLI `1.0.83` — implemented and GREEN on Windows and macOS branch CI.
3. Release/versioning policy — implemented in `docs/VERSIONING.md`.
4. Replace example capabilities with reviewed team content — pending identified owners; no placeholder replacement was invented.

P0 should happen before adding major new feature families.

### P1 — Native MCP and Hook capabilities, with governance first

#### P1.1 Shared MCP

Status: capability support and governance implemented. The Marketplace accepts and validates native Agent Plugin `mcp.json`; `team-ai status` and `doctor` inspect native MCP metadata through `copilot plugins list --kind mcp --json`.

No real MCP server was added. A concrete server still requires an internal use case and an owner for credentials/security review.

Preferred design:

```text
Agent Plugin native MCP definition
        |
        v
Copilot native loading/trust
```

Do **not** add a Team AI MCP converter/injector.

Implemented validation/doctor coverage:

- declared executable/source visibility;
- obvious invalid command/path diagnostics;
- documentation of required credentials without storing secrets;
- trust/governance warnings.

Why before Hooks: an MCP gives high reusable value while usually having a clearer explicit tool boundary than automatically firing Hooks.

#### P1.2 Shared Hooks

Status: capability support and governance implemented. The Marketplace accepts and validates native `com.github.copilot/hooks/hooks.json`, including source containment, cross-platform command shape, HTTPS, and obvious remote download/execute rejection.

No real Hook was added because no automatic lifecycle command has been justified. Copilot CLI `1.0.83` does not expose structured live Hook inspection, so `status`/`doctor` report that limitation and never execute Hooks to probe them.

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

#### DESIGN DEVIATION — capability support without capability instances

Original design: Defer P1.1/P1.2 until a concrete MCP server or Hook implementation was ready to ship.

Observed behavior: The product requirement is for Team AI to support and govern the native capability types independently from publishing a real MCP server or Hook.

Evidence: Copilot CLI `1.0.83` exposes safe structured MCP discovery, while its own help states that Hooks require a live session and are not covered by structured Plugin inspection. Agent Plugins 1.0 defines root `mcp.json`; Copilot defines `com.github.copilot/hooks/hooks.json`.

Minimal necessary change: Add declaration-only Marketplace validation plus read-only MCP status/doctor inspection and an explicit Hook inspection limitation. Use synthetic fixtures for tests; do not add a production MCP server, Hook, injector, or runtime.

YAGNI impact: Team AI now supports both native capability types without inventing a use case, credentials, lifecycle automation, or execution layer.

#### P1.3 First real Product Plugin

Completed with `product-teamai@teamai`. Its native `teamai-change-readiness` Skill is shared by the CLI and Marketplace repositories and has explicit validation completion criteria. It contains no custom runtime, MCP, Hook, or injection layer.

Add future Product Plugins only when a real Product has capabilities shared by multiple code repositories. Do not add `product-*` as a template-only shell.

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
1. Identify owners for reviewed Common/API replacement content
2. Select one real shared MCP use case and credential/security owner before adding an MCP implementation
3. Select one real Hook lifecycle use case and security reviewer before adding a Hook implementation
4. Run the full Product init E2E on a real macOS machine before release
5. Add contribution/publish PR workflow when manual contribution becomes painful
6. Integrate LLM Wiki Runtime through a small Skill/MCP
7. Revisit Learning only after the above is stable
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
