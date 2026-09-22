# V3 execution plan

Authoritative inputs: docs/v3/team-ai-next-architecture-final-v3.md and docs/v3/team-ai-next-implementation-plan-v3.md. These supersede older Product/non-goal instructions.

CLI baseline: 6123ec2fcbb30257b78784d086888ffefcd71ac7; branch feat/team-ai-v3-cli.
Marketplace baseline: 520f2f7fa92ab60586487245f3fe02828c15b2f4; branch feat/team-ai-v3-marketplace.
Worktrees: F:/agent-workspace/codex/repos/team-ai-v3/{teamai-cli-customization,teamai-marketplace}.
Initial boundary: no commits, pushes, publication, or external contribution PR without subsequent explicit authorization. User subsequently authorized committing/pushing accepted work and Phase16 after acceptance. Deliver only to the feature branches; no main push or merge. External contribution PR E2E remains unrun. Preserve original checkouts.

Execution order: Phase 1 cache; Phase 2 instruction contract regression; Phase 2.5 Product removal; Phases 3-8 logical projects/plugins/instructions/docs/learnings; Phase 9 learning contribution; Phases 10-14 skill catalog/metadata/read/install; Phase 15 skill contribution; Phase 16 integrated convergence/diagnostics. Phase 17 deferred by source plan.

Reuse native/fallback, state, atomic writes, locks, dry run. No generic provider/resource framework, recall engine, live tag subscriptions, or legacy Product compatibility.

Acceptance: v3 observable command behavior and ownership boundaries, isolated contribution worktrees, current-cache-only action/read commands, real backend smoke separately from simulated integration. Gates run sequentially: typecheck, unit, integration, build, Marketplace validate/test, native/fallback and Marketplace real Copilot E2E. Report unavailable VS Code/client discovery and external PR tests explicitly.

| Task | Phases | Owner/model | Status | Rework |
| --- | --- | --- | --- | --- |
| cache | 1 | cache / gpt-5.6-luna max | accepted | 2 + user-authorized correction |
| logical_projects | 2, 2.5, 3-8 | logical_projects / gpt-5.6-terra high | accepted | 1 |
| contributions | 9 | contributions / gpt-5.6-terra high | accepted | 2 |
| skills | 10-14 | skills / gpt-5.6-terra high | accepted | 2 |
| skill_contribution | 15 | contributions / gpt-5.6-terra high | accepted | 0 |
| integration | 16 | logical_projects / gpt-5.6-terra high | accepted | 2 |

Independent reviewer: gpt-5.6-sol max, Standards and Spec axes sequentially, no recursive delegation. Reviews include unstaged/untracked changes, not just HEAD. Supervisor owns integration and this ledger.

## Frozen task boundaries and interfaces

- Phase 1: catalog loader accepts explicit refresh/dry-run intent; CommandContext binds homeDir. Only init/sync request refresh. Persist revision without changing config version 1. Existing cached read callers default to no fetch.
- Phase 2: retain already-shipped instructions root, add plugin rules package/lifecycle regression. No duplicate migration implementation.
- Phase 2.5: remove Product command/type/helpers/example, then Phase 3 manifest with optional plugin. Reference teamai project may exist without any plugin; do not rename a demo to imply a necessary executable plugin.
- Phases 4-8: one project convergence entry reused by init/projects set/sync. Preserve native user-owned settings. Store explicit logicalProjects and owned plugin/projection paths. Ownership is per physical workspace (linked worktrees share anchor but not projection roots); do not infer ownership from another workspace. Reserve shared context ID to prevent overlap with learnings/shared. Reject occupied unowned reserved roots before projection writes. Keep bytes/applyTo unchanged and exclude only managed paths via Git-resolved info/exclude.
- Phase 9: GitHub-only contribution helper, isolated checkout/worktree, branch/commit/push/PR only when user invokes action; dry run previews. Never change active business worktree or shared cache. Reuse helper for Phase 15.
- Phases 10-14: discover both physical skill locations, YAML owner/tags/standalone only; no source metadata duplication. Explicit desired IDs plus actual ownership records; refuse user collisions, leave containing Plugin intact. Tag selection resolves current IDs only. Real installed enablement decides available-via-plugin, not role assumption alone.
- Phase 16: integrate state diagnostics and document commands, tests, limitations; no new resource/provider framework.

Environment observations: Windows, real Copilot CLI 1.0.83 and gh 2.100.0 found. PATH code.cmd currently contains null bytes and emits no version; VS Code discovery is not verified. Existing fallback smoke fabricates code detection and then uses real Copilot recognition, so cannot be called real VS Code E2E.

## Baseline checks (Windows, before implementation)

- typecheck: PASS.
- unit: 34 passed, 1 skipped (10 files).
- integration: FAIL, 21 passed and 8 timeout failures in cli.test.ts (10/15 second limits), duration 245s. No assertion failure reported. Focused rerun pending; do not treat as green.
- Focused rerun: doctor reports native MCP inspection errors PASS (3.0s); original default-suite timeout remains recorded. Final integration will also run with sequential files to avoid concurrent subprocess pressure.
- Marketplace baseline validate PASS; Node tests 20/20 PASS.

## Native discovery probe

Read-only acceptance agent verified Copilot 1.0.83 in an isolated offline profile: plugin skills, personal skills, repository skills, user/repository instruction discovery are observable via plugins list --kind plugin --kind skill --kind instruction --json and skill list --json. Listing does not prove applyTo injection; ignored context docs need an actual agent read sentinel. Plugin rules were not listed as standalone instructions. Real VS Code executable found at D:/soft/Microsoft VS Code/bin/code.cmd (1.138.0 x64); PATH-first code.cmd remains corrupt. Final fallback smoke must use the real executable and distinguish CLI version detection from IDE discovery.

## User scope update: applyTo (2026-09-22)

For this iteration, all newly maintained instructions/examples/fixtures use applyTo: "**". Defer portable/file-specific/general path glob scenarios and their runtime matching checks. TODO: revisit native applyTo path/glob behavior in a later iteration when requested. Projection continues preserving source bytes; do not rewrite external Marketplace frontmatter. This explicit user update overrides the v3 portable-glob acceptance scenarios for this iteration.

## Phase 1 submission

Owner cache (gpt-5.6-luna/max), ready for independent review; no commits. Worker executed typecheck PASS, build PASS, unit 37 passed/1 skipped, focused catalog/config 9 passed, fallback integration 1 passed, diff --check PASS. Reviewer review_cache (gpt-5.6-sol/high) assigned. Rework count 0. Full final gates still required.
- Phase 1 real native Copilot E2E: PASS on win32 (npm run test:e2e:copilot). Covers existing plugin installation/enablement and settings, not new logical contexts or runtime applyTo.
- Independent gate attempt: typecheck PASS; default npm test 65 passed/1 timeout/1 skipped (interactive init30s), while native E2E was also running. Source review initially deferred by reviewer. Rework1 assigned: serialize Vitest test files without changing assertions/timeouts; run focused failure and full sequential gate after E2E completion. Reviewer asked to continue read-only Standards/Spec inspection while gate is repaired.
- Baseline temporary directory cleanup was rejected by automatic approval policy (blocked by policy). Retain those artifacts; no bypass attempted.
- Phase 1 rework2 gate: npm test PASS (14 files, 66 passed/1 skipped,123.73s), typecheck PASS, build PASS, diff --check PASS. Integration real-subprocess tests use one documented60s budget; assertions unchanged. Prior failures retained above. Source audit by cache_source_review (gpt-5.6-sol/high) pending. Rework count2.
- Phase 1 accepted after user-authorized extra correction: default FallbackCopilotClient loader now binds constructor homeDir; focused fallback2pass and typecheck PASS. Independent source reviewer resolved original Spec finding, no remaining code findings. Phase1 complete (Windows verified; macOS not executed).
- logical_projects (gpt-5.6-terra/high) START authorized for ordered Phases2,2.5,3-8. Own coordinated CLI/Marketplace implementation; supervisor owns ledger/notes. No commits/push.

## Phases 2-8 submission

logical_projects (gpt-5.6-terra/high) ready for review. Product removed; project manifest/commands/optional plugin ownership/context projections implemented; all new applyTo examples use **. Worker actual checks: typecheck PASS, unit39pass1skip, focused project/retired-option/fallback-rule checks PASS, Marketplace validate PASS and20tests PASS, diffcheck PASS. Full integration/build/E2E on integrated result pending. Independent review_projects (gpt-5.6-sol/high) source review assigned, no full test concurrency. Rework0.
- Supervisor integrated npm test after Phases2-8: PASS15files68passed1skipped,138.23s. CLI integration24cases allpassed; real-subprocess budget stable. Smoke scripts/docs still contain legacy Product references identified during integration read; require correction before stage acceptance, not claimed done.
- Phases2-8 rework1: updated smoke to --project and projection/native instruction assertions; manifest now rejects non-object entries and non-string IDs; current handoff/readmes refreshed. Worker typecheck PASS, focused manifest4/4 PASS, smoke syntax PASS, both diff checks PASS. Narrow independent re-review pending; actual updated E2E deferred to final integrated gate.
- Phases2-8 accepted: independent re-review resolved original three findings. Supervisor corrected sole remaining P3 documentation heading directly (low-risk local-edit exception), build PASS. Phase9 assigned to contributions (gpt-5.6-terra/high), rework0. Full final E2E remains pending.
- Updated Phases2-8 real native Copilot E2E: PASS win32, using freshly built CLI and sibling reference Marketplace, isolated profile/TEMP under F:; covers project instructions/docs/shared learning projection plus native instruction listing. This is discovery/materialization evidence, not model injection or ignored Docs runtime-read evidence. Final skill-aware E2E still pending.

## Phase 9 submission

contributions (gpt-5.6-terra/high) implemented GitHub-only isolated bare clone + Git worktree contribution, learning routing/frontmatter, CLI wiring. Focused integration5passed and typecheck PASS. Tests exercise real local Git branch/worktree/push plus mocked gh; external GitHub PR E2E not run. review_learning (gpt-5.6-sol/high) independently reviewing, rework0. Supervisor requested existing routing tests inject FakeCopilot to avoid unrelated real CLI version subprocess overhead.
- Routing tests now use existing fake client:5passed in12.15s. Independent review Standards0/Spec1 P2: business-repo-only Git identity is lost in isolated clone. Rework1 assigned: pass resolved name/email into isolated commit without changing global config; reuse for Phase15.
- Phase9 accepted after rework1 and narrow independent review: explicit business Git name/email applied through git -c only to isolated commit. Local Git integration with no global identity5passed; typecheck PASS. No remaining findings. Phases10-14 START issued to skills (gpt-5.6-terra/high).

## Real ignored Docs read attempt

Copilot CLI1.0.83 probe used an isolated F: profile/repo, existing authentication environment without printing/copying credentials, a random sentinel present only in the ignored Doc, and verified git check-ignore. Initial budget5 rejected before request (CLI minimum30); retry with minimum30 failed authentication: classic PAT in GH_TOKEN is unsupported by Copilot. No model response/read tool trace obtained; no login or credential changes attempted. Probe directories cleaned. Ignored Docs actual model read remains NOT VERIFIED; requires supported Copilot authentication. This does not block remaining local implementation/gates.

## Phases 10-14 submission

skills (gpt-5.6-terra/high) implemented strict unified catalog/metadata, read/tag commands, managed personal projections and install/remove, explicit IDs/ownership, reference standalone release-helper. Reused directory replacement from fallback; unchanged content is not recopied. Worker typecheck PASS; focused catalog/config/skill/command15passed; fallback2passed; Marketplace validate PASS/test20passed; both diff checks PASS. review_skills (gpt-5.6-sol/high) reviewing, rework0. Full integrated build/tests/native personal discovery pending final gate.
- Supervisor complete npm test after strict catalog integration: PASS18files81passed1skipped147.41s, no timeouts. Source review still pending; green suite is not evidence against untested ownership/dry-run edge paths identified for review.
- Independent review Standards0/Spec3: remove stale selected via-plugin ID; persist plugin ownership before later convergence failure; use planned enablement for dry-run skill convergence. All assigned together as rework1, including small planned-project-settings return reuse. No broad state framework.
- Phases10-14 accepted after rework1: all three findings resolved by narrow independent review. Worker focused10passed, typecheck PASS, fallback2passed, diff-check PASS. Phase15 START issued to contributions (gpt-5.6-terra/high), rework0.
- Parent integration follow-up (skills rework2): list/show mislabeled an existing user-owned personal Skill as not installed. Narrow read-status correction assigned to original worker; no adoption or mutation, no repository-skill discovery expansion.
- Skills rework2 accepted by independent narrow review: unmanaged personal state now reported read-only; typecheck PASS/skill integration3passed/diff-check PASS. No remaining findings.

## Phase 15 submission

contributions (gpt-5.6-terra/high) implemented skill contribute using Phase9 helper, current isolated-worktree catalog checks, derived Plugin source root, YAML metadata update and minimal structural checks. Focused real local Git/worktree plus mock gh integration1passed; typecheck/diff-check PASS. External PR E2E not run. review_skill_contribution (gpt-5.6-sol/high) reviewing, rework0.
- Phase15 accepted: independent Standards0/Spec0. Test actually pushes standalone into local fixture; Plugin target covered by dry-run/source review only, not actual push. Phase16 START issued to logical_projects (gpt-5.6-terra/high) for integrated diagnostics/docs/native smoke; final gate scheduled after implementation/review.

## Phase 16 submission and final gates

logical_projects (gpt-5.6-terra/high) added status sections, read-only doctor consistency checks reusing dry-run convergence, skill-aware native smoke, real VS Code CLI detection in fallback smoke, and current documentation. Worker typecheck PASS; focused CLI+skills27passed109s; smoke syntax PASS; Marketplace validate PASS/tests20passed; both diff checks PASS. review_integration (gpt-5.6-sol/high) reviewing, rework0.

Parent final integration also corrected valid dotted Logical Project IDs in Learning branch names (Phase9 rework2): only branch fragment normalized; source ID preserved in path/frontmatter. Focused5passed/typecheck PASS, independent narrow review resolved. No outstanding Phase9 findings.

Final gate started: typecheck PASS. Complete npm test running sequentially; build and real E2E follow.
- Final CLI gate: typecheck PASS, npm test PASS19files84passed1skipped167.51s (unit46passed1skipped; integration38passed), build PASS. Skip is existing Windows permission-mode test.
- Updated native E2E attempt FAILED at exact Logical Project instruction path assertion (smoke-team-ai.mjs). Source projection exists; native JSON schema/discovery being probed before changing assertions. Not recorded as PASS. Phase16 rework1 pending concrete probe evidence; no reason to repeat unit/integration for a script-only correction.
- Resume: Phase16 worker/reviewer were interrupted by account usage limits, not a code result. Rework1 continues after user pickup. Actual offline schema probe confirms plugins list rows have no path; instructions expose name/scope/source and preserve duplicate basenames (two context.instructions.md rows). Skill list --json exposes directory paths; Plugin paths refer to installed copies, not Marketplace source. Smoke must assert only observable native contracts. Status cache-failure sections and doctor normalized ownership-state comparisons are included in this rework batch.
- Marketplace gate after pickup: validate PASS; tests20/20 PASS. Real Copilot smoke FAILED at the common Skill assertion because it also required a nonexistent path on plugins-list rows. Correcting this same schema mistake in the Phase16 rework1 batch; no PASS claim until rerun.
- Phase16 rework1 source review: Standards0/Spec0. Full gate then found a status regression: instruction target errors were mislabeled as cache errors. Actual result83passed/1failed/1skipped166.99s; build in that chained gate did not run. Rework2 splits instruction failure handling from cache acquisition; independent narrow review Standards0/Spec0. Separate build PASS; final rerun pending.
- User authorized feature-branch commit/push during final verification. Marketplace accepted content committed and pushed as c5969dc on feat/team-ai-v3-marketplace; Phase16 smoke/readmes remain uncommitted until real checks finish. CLI remains uncommitted pending the coupled Phase16 diagnostics gate.
- During the same rework2 acceptance batch, real native smoke exposed a second path assumption: local Marketplace Plugin Skills point directly to Marketplace source, unlike the earlier direct-install probe. A minimal isolated probe verified that exact path; smoke now asserts source/plugin/enabled and the expected local Marketplace Skill directory before and after personal Skill removal. Fallback first failed Windows code.cmd quoting; reuse of existing cross-spawn fixed it. Corrected fallback E2E PASS on win32 with the real VS Code 1.138.0 executable and real Copilot recognition. Independent source re-review found no code findings; parent corrected a small README sentence separating top-level Skill installation from Plugin enablement conditions.

## Final acceptance and delivery

### Remote CI follow-up and authorized PR delivery

User authorized investigating/fixing actual CI failures, creating both PRs to main, and merging only after their PR CI passes. CLI baseline for this follow-up: c9c34fa. Remote run35675362458 passed macOS but failed three Windows catalog cache tests with Git pack Filename too long (not a timeout). Frozen scope: reproduce long Windows cache paths, fix native Git handling locally without changing global Git configuration or suppressing tests, verify clone and refresh, then typecheck/test/build plus remote Windows/macOS CI. Owner windows_cache_fix (gpt-5.6-terra/high), independent reviewer gpt-5.6-sol/high; rework0. Marketplace PR6 targets main and awaits its own checks. Parent owns PR/merge and this ledger.

User subsequently requested minimal changes and lower credit use, with no local full-suite rerun. Worker reproduced Git failure at a527-character checkout path and supplied a focused regression, then hit account quota. Parent completed the one-line localized fix under the small-edit exception: git clone -c core.longpaths=true, persisted only in the cloned repository for later fetch/reset. No global setting or workflow suppression. Catalog10/10 and typecheck PASS; regression checks both initial checkout and refreshed long-path contents, plus repository-local configuration. PR CI remains the full-platform merge gate. Marketplace PR6 passed Windows/macOS tests and native Copilot contracts and merged as87f18b2d64a495322faed32eeace3426b7d367a7. Earlier macOS-unverified notes refer to local execution; remote Marketplace contracts and CLI test matrix now provide separate macOS evidence.

- Phase16 accepted: independent source re-review has no remaining Standards/Spec findings. Real native CLI E2E PASS; real fallback E2E PASS; Marketplace real Copilot smoke PASS (Windows, Copilot1.0.83). No fabricated backend substituted for these checks.
- Final CLI gate after all source fixes: typecheck PASS; full npm test84passed/1skipped across19files,161.59s (unit46passed/1skipped; integration38passed); build PASS. Existing Windows skip is POSIX permission behavior. Marketplace validate PASS/tests20passed. Earlier failed attempts remain in the ledger above.
- Phases1-16 including2.5 implemented; Phase7 ignored-docs model-read acceptance remains unverified because supported Copilot authentication is unavailable. Phase17/18 explicitly deferred. No general applyTo globs implemented, per user override.
- Not verified: model instruction injection/Plugin Rule runtime, ignored Docs model read, VS Code extension discovery, macOS, real external contribution PR. Local Git/mock-gh contribution integration is not real external E2E; Plugin-target contribution actual push is not tested.
- Marketplace delivery: c5969dc content + 2d49e12 smoke/docs pushed to origin/feat/team-ai-v3-marketplace. CLI source/tests committed and pushed as61d14c0 to origin/feat/team-ai-v3-cli. This final documentation/smoke commit accompanies that accepted implementation; remote final tips are reported in the delivery response.
- Both authoritative V3 copies retain SHA25661A1A0E0044821099AC8C781FC12CD63480369000176514BBABF204F6C17CD93 (architecture) and A0A88186AD75BEDB5C06DD7897DA3A2194D088A39D97E5C13DA83A51189623AF (implementation plan), identical to supplied originals.
- Original checkouts remain on main at the pinned baselines. CLI original status: modified .gitignore and untracked .codegraph/; Marketplace original status: untracked .codegraph/. These pre-existing changes were preserved. No main push or merge performed.
