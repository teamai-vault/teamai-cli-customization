# Team AI CLI — V3 handoff

The authoritative V3 architecture and ordered work ledger are [`v3/team-ai-next-architecture-final-v3.md`](v3/team-ai-next-architecture-final-v3.md), [`v3/team-ai-next-implementation-plan-v3.md`](v3/team-ai-next-implementation-plan-v3.md), and [`v3/EXECUTION.md`](v3/EXECUTION.md).

The CLI keeps native Copilot Marketplace and Agent Plugin behavior. User scope installs `common` and all `role` plugins, enables `common` plus one selected role, and records ownership in `config.managedPlugins`.

The CLI package also owns one self-contained built-in Agent Skill at `skills/team-ai/`. It is not Marketplace content and has no runtime dependency on a department Marketplace. `init` and `sync` converge it to `~/.copilot/skills/team-ai/`; ownership/version metadata lives under `~/.team-ai/built-in-skills/`, and an unowned pre-existing target is a hard collision. `doctor` diagnoses the built-in Skill read-only. The Skill is intentionally thin: it maps user intent to public `team-ai` commands and treats current CLI `--help` as the syntax source of truth.

Logical Project is the only business-context entity. A Marketplace may publish `manifest/projects.yaml`; a Physical Project is a real Git workspace. `team-ai init` is user-scope only; `team-ai projects set <ids...>` is the only command that binds contexts to that workspace, and `sync` re-converges the saved binding of the current workspace. An optional `kind: project` Plugin is enabled through repository settings only when the manifest requests it and Team AI explicitly owns that setting.

Project context convergence is shared by `projects set` and `sync`. It mirrors active project instructions to `.github/instructions/team-ai/<id>/`, docs and shared/project learnings to `.team-ai/context/`, writes a thin pointer instruction, preserves source bytes and `applyTo`, rejects unowned reserved paths, and excludes only those paths through Git-resolved `info/exclude`.

Current implementation:

- `sync` is the one concrete convergence path for Marketplace registration, User Plugins/instructions, Logical Project context, optional Project Plugin settings, shared/project learnings, and managed personal Skills.
- `status` reports compact Logical Projects, personal Skills, Project context/learning projection, and Marketplace revision. `doctor` performs read-only cache and dry-run convergence diagnostics; it never refreshes cache or repairs state.
- Skills use strict `skills.yaml` catalog metadata. `learning share` and `skill contribute` use an isolated GitHub worktree/PR flow; tag installation requires `--yes` only when non-interactive selection is needed.

Current CLI worktree validation (Windows, Copilot CLI 1.0.83):

```text
CLI version                           0.3.0
CLI typecheck                         PASS
CLI sequential full test gate         95 passed, 1 skipped (24 files, 162.35s)
  unit                                55 passed, 1 skipped
  integration                         40 passed
CLI build                             PASS
CLI real native Copilot E2E            PASS
CLI real fallback E2E                  PASS
CLI npm package artifact              PASS
```

The Marketplace repository is unchanged by the built-in Skill follow-up; its earlier V3 validation evidence is not re-labeled as a fresh run here.

Phases 1–16 (including 2.5) are implemented and accepted within the verification limits below. Phase17 Learning promotion and Phase18 LLM Wiki remain deferred by V3. All maintained instruction examples use `applyTo: "**"`; general path/glob support is a recorded later TODO.

Native E2E verifies projection and discovery, personal Skill install/remove, and Plugin Skill preservation. Local Marketplace Plugin Skills point to their source directories; direct-install Plugin probes used installed copies. Fallback uses the real VS Code CLI at `D:/soft/Microsoft VS Code/bin/code.cmd`, materializes native filesystem state, and verifies real Copilot recognition. This does not verify VS Code extension discovery.

Not verified: authenticated model reading of ignored docs (existing classic PAT rejected by Copilot), actual `applyTo` injection, runtime Plugin Rule execution, macOS, or external GitHub contribution PR creation. Contribution integration uses real local Git worktrees/branches/push with mocked `gh`; it is not external E2E. Plugin-target Skill contribution was checked through dry-run/source review, while the standalone target exercised local push.

Initial integration timeouts were caused by concurrent subprocess load and short command-chain budgets. Test files now run sequentially with a 60-second command-chain budget; no production deadlock was demonstrated. The one Windows skip covers POSIX permission semantics.

The V3 baseline was delivered on `feat/team-ai-v3-cli` and `feat/team-ai-v3-marketplace` in `F:/agent-workspace/codex/repos/team-ai-v3/`. This built-in Skill follow-up is currently on `feat/builtin-team-ai-skill` in an isolated worktree and remains uncommitted/unpushed at this handoff. Main is not modified or merged. See `v3/EXECUTION.md` for the earlier V3 delivery details.
