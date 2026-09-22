# Managed User Instructions Validation Handoff

Date: 2026-09-16
CLI implementation commit: `fc5a95c79385bb494ba102816d175bc65793b412`
CLI test-stability commit: `f19fc880ba6de14259eb5fdc85d1939130979bd7`
Marketplace implementation commit: `84e6241b34c775e107d67c33179105cdc7f3fef9`

> **Historical evidence.** This record preserves commands and results from the retired Product interface, including `--product` below. It is not a current command reference and must not be used for new validation. V3 uses Logical Projects; see [`HANDOFF.md`](HANDOFF.md) and [`../scripts/README.md`](../scripts/README.md) for current checks.

## Anchor test timeout diagnosis

The reported failure was both tests in `test/integration/anchors.test.ts` exceeding Vitest's default 5-second per-test timeout while repository gates were running concurrently. Each test creates a Git repository and starts seven or eight Git subprocesses before asserting project identity.

This run found no deterministic production failure, shared mutable test state, or leaked child process:

```text
npx vitest run test/integration/anchors.test.ts --reporter verbose
PASS — 2 passed; 1456 ms and 1657 ms

npm test
PASS — 14 files; 63 passed, 1 skipped
anchors — 3154 ms and 2291 ms

CLI npm test + Marketplace npm test, started together
PASS / PASS
anchors — 2290 ms and 2100 ms

focused anchors + CLI npm test + Marketplace npm test, started together
PASS / PASS / PASS
focused anchors — 2276 ms and 2113 ms
```

The timings increase materially under concurrent process load and approach the fixed 5-second limit without changing results. The fix is limited to 15-second timeouts on these two Git-process integration tests, matching the existing test-local timeout pattern elsewhere in the suite. Global Vitest timeout and file parallelism are unchanged.

The same three-process scenario after the change passed again; focused anchors took 3016 ms and 2193 ms. The post-change standalone default gate also passed with anchors at 2749 ms and 2015 ms.

An independent pre-commit code-review rerun of `npm test` also passed and directly exercised the repaired boundary: the two anchor tests took 4185 ms and 5668 ms, so the second test exceeded Vitest's former 5-second default without failing under the new test-local timeout.

## Current automated gates

Environment: Windows `win32`, Node `v24.15.0`, npm `12.0.2`, Copilot CLI `1.0.83`, VS Code `1.137.0`.

The following complete repository pipelines were started together. Commands inside each pipeline ran sequentially and stopped on the first failure.

```text
CLI pipeline: npm test → npm run typecheck → npm run build → npm run test:e2e:copilot → npm run test:e2e:fallback
Marketplace pipeline: npm run validate → npm test → npm run test:copilot
```

CLI pipeline results:

```text
npm test                         PASS — 14 files; 63 passed, 1 skipped
npm run typecheck                PASS
npm run build                    PASS
npm run test:e2e:copilot        PASS — Real team-ai native Copilot E2E passed on win32.
npm run test:e2e:fallback       PASS — Fallback materialization and native Copilot recognition passed on win32.
```

Marketplace pipeline results:

```text
npm run validate                 PASS — Marketplace validation passed.
npm test                         PASS — 20 passed, 0 failed
npm run test:copilot             PASS — Copilot CLI 1.0.83 local Marketplace contract passed on win32.
```

The E2E scripts used temporary HOME/profile and repository directories and removed them in `finally`.

## Isolated Windows deployment

The reference Marketplace was recursively copied into a temporary directory. The built CLI was run against that copy with isolated `HOME`, `USERPROFILE`, `COPILOT_HOME`, `APPDATA`, and `LOCALAPPDATA`; authentication token variables were removed from the child environment.

```text
node dist/cli.js init --marketplace <isolated-marketplace> --role api --product teamai
node dist/cli.js sync
```

Executed assertions:

- `init` installed `global.instructions.md` and nested `git/commit.instructions.md` with byte-for-byte equality to the Marketplace source;
- `sync` updated the global file byte-for-byte, removed the deleted nested file, and created nested `release/versioning.instructions.md` byte-for-byte;
- pre-existing `copilot-instructions.md`, `instructions/personal.instructions.md`, and `instructions/private/team.instructions.md` were unchanged after both commands.

Probe output:

```text
INIT_ASSERTIONS=passed
SYNC_ASSERTIONS=passed
REAL_FILE_DEPLOYMENT=passed
CLEANUP_PROBE_ROOT_REMOVED=true
```

## Native client discovery

### Copilot CLI

`copilot help commands` exposes interactive `/instructions` and `/env` commands, but the CLI help exposes no non-interactive inspection subcommand.

A fresh isolated profile was created under the workspace temp root with a unique `*.instructions.md` marker. `HOME`, `USERPROFILE`, `COPILOT_HOME`, `APPDATA`, and `LOCALAPPDATA` pointed only to that profile; `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`, and `COPILOT_TOKEN` were removed from the child environment. This command was attempted:

```text
copilot -p /env --no-auto-update --no-color --output-format json --log-dir <isolated-logs>
```

Result: exit 1, `Error: No authentication information found.` The log contained only the authentication error and no marker or instruction-discovery evidence. Actual Copilot CLI discovery remains **not verified** because the isolated profile has no supported authentication credential. File existence is not counted as discovery.

### VS Code

The valid CLI is `D:\soft\Microsoft VS Code\bin\code.cmd`; the earlier PATH entry `D:\soft\bin\code.cmd` is a 41-byte invalid shim. Read-only extension listing on the real profile returned only `intellsmi.comment-translate@3.1.0` and `wsr-7.easymail@0.4.0`. A fresh isolated `--user-data-dir` and `--extensions-dir` returned zero extensions.

VS Code `--help`, `chat --help`, and `agent --help` expose no instruction-discovery diagnostic. Actual VS Code discovery remains **not verified** because no GitHub Copilot extension is installed and no non-visual CLI diagnostic is available. No extension was installed and no real VS Code profile was changed.

## macOS coverage

The current host is Windows and no macOS host or runner was available in this run, so real macOS behavior is **not verified**. Automated coverage present in the repositories is:

- `test/unit/user-instructions.test.ts` checks `/Users/example/.copilot/instructions/team-ai` on non-Windows path semantics;
- both GitHub Actions workflows include `macos-latest` in their test matrices;
- the CLI macOS matrix runs typecheck, tests, and build; the Marketplace macOS matrices run validation, tests, and the Copilot contract.

The task branch is local and was not pushed, so no macOS workflow result exists for these commits. No platform abstraction or macOS-specific implementation branch was added.

## Cleanup

All isolated Copilot, VS Code, and parallel-load probe directories created by this run were removed. No real user profile, credential, extension installation, or instruction file was modified.

Unresolved external acceptance blockers: authenticated observable Copilot CLI discovery, VS Code discovery with the Copilot extension and a non-visual diagnostic path, and execution on a macOS runner or host.
