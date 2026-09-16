# Managed User Instructions Validation Handoff

Date: 2026-09-16
CLI implementation commit: `fc5a95c79385bb494ba102816d175bc65793b412`
Marketplace implementation commit: `84e6241b34c775e107d67c33179105cdc7f3fef9`

## Automated gates

Environment: Windows `win32`, Node `v24.15.0`, npm `12.0.2`, Copilot CLI `1.0.83`.

CLI repository (`<workspace>/teamai-cli-customization`):

```text
npm test                         PASS — 14 files; 63 passed, 1 skipped
npm run typecheck                PASS
npm run build                    PASS
npm run test:e2e:copilot        PASS — Real team-ai native Copilot E2E passed on win32.
npm run test:e2e:fallback        PASS — Fallback materialization and native Copilot recognition passed on win32.
```

Marketplace repository (`<workspace>/teamai-marketplace`):

```text
npm run validate                 PASS — Marketplace validation passed.
npm test                         PASS — 20 passed, 0 failed
npm run test:copilot             PASS — Copilot CLI 1.0.83 local Marketplace contract passed on win32.
```

## Isolated Windows deployment

The reference Marketplace was archived from its task-branch `HEAD` into a temporary copy. The built CLI was run with isolated `HOME`, `USERPROFILE`, `COPILOT_HOME`, `APPDATA`, and `LOCALAPPDATA`; no real profile was changed.

Commands executed:

```text
node <workspace>/teamai-cli-customization/dist/cli.js init --marketplace <temp>/ticket03-native-<run>/marketplace --role api --product teamai
node <workspace>/teamai-cli-customization/dist/cli.js sync
```

Observed assertions:

- `init`: reference `global.instructions.md` and nested `git/commit.instructions.md` were installed under `~/.copilot/instructions/team-ai/` with byte-for-byte equality; three personal files (`copilot-instructions.md`, `instructions/personal.instructions.md`, and `instructions/private/team.instructions.md`) were unchanged.
- `sync`: changed global content was byte-for-byte updated, removed nested content was deleted, a new nested `release/versioning.instructions.md` was created byte-for-byte, and all three personal files remained unchanged.
- Probe output: `INIT_ASSERTIONS=passed`, `SYNC_ASSERTIONS=passed`, `REAL_FILE_DEPLOYMENT=passed`.

Security-model clarification authorized for V1: visible link-like and unsafe boundaries are rejected during inspection; malicious concurrent path replacement is outside V1 scope.

## Native client discovery

Copilot CLI `1.0.83` documents `/instructions` (“View and toggle custom instruction files”) and `/env` (“Show loaded environment details (instructions, ...)”) in `copilot help commands`. There is no non-interactive inspection subcommand in the exposed CLI help.

The isolated probe used a unique marker and was cleaned up. `copilot -p /instructions` could not authenticate: the isolated profile had no authentication information, and the only available `GH_TOKEN` was a classic PAT rejected by the CLI (`Classic PATs are not supported`). A text-only `copilot -i /instructions --screen-reader ...` probe had no non-interactive completion and was stopped at the 90-second safety limit. Therefore actual Copilot CLI discovery is **not verified** here; file existence is not treated as discovery.

VS Code `1.137.0` is installed. Using `<code-cli>`, `--list-extensions --show-versions` finds no GitHub Copilot/Copilot Chat extension. The PATH shim for `<code-cli>` is invalid (41-byte zero-filled file). The valid VS Code CLI `--help` exposes no user-instruction discovery diagnostic. Therefore VS Code discovery is **not verified** here.

## Cleanup

The isolated profile, repository, Marketplace copy, logs, and probe scripts were removed in `finally`; the cleanup assertion was `CLEANUP_PROBE_ROOT_REMOVED=True`. A final scan found no `ticket03-*` entries under `<temp-root>`. Existing unrelated temporary entries were not touched.

Unresolved acceptance items: observable native Copilot CLI discovery and VS Code discovery require an authenticated Copilot CLI session and an installed Copilot VS Code extension with a text/CLI diagnostic path.
